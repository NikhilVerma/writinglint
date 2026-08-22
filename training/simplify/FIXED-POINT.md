# The fixed point

Working notes for the stage-2 rewriter. Everything here is measured, and the
numbers are the reason each decision was made. Read this before changing
`src/lib/reward.ts`, `config.json`, or the GRPO plan.

Last updated 2026-08-22.

## The goal

Paste a document into the rewriter and it should change a lot. Paste the
result back in and it should change almost nothing. The target is **under 2%
of words moved on the second pass**, against roughly 20% on the first.

A model that fails this has no stopping point. It always finds more to cut, so
a user who runs it twice gets a different and shorter document each time.

## Why the reward fought itself

The reward has to pay for two opposite behaviours. Removing slop needs
editing. Being a fixed point needs the opposite. While those were two separate
knobs, tightening either one loosened the other, which is why the arm that
drifted least scored worst.

The contradiction was ours. Nothing in the reward knew **how much** editing a
document deserved. The echo gate paid monotonically for more change. The lint
term paid monotonically for fewer findings. Neither had any notion of enough,
so "edit harder" always won and no amount of editing was ever sufficient.

The missing variable is the size of the problem. Once the change demanded
scales with the damage present, both goals become one goal. A document one
finding above the band earns a one-finding edit. A filthy one earns a rewrite.
A clean one earns nothing. A fixed point then exists by construction, because
text already inside the band has a correct edit size of zero.

That is what `echoWorkSpan` implements. See the echo gate comment in
`src/lib/reward.ts`.

## What the measurements say

### The lint term was mostly not measuring slop

Per-rule, over 250 paired documents. Each pair is a human original and the
sloppified version made from it, so a rulepack that cannot separate the two
carries no signal about AI habits.

| priced rules | slop /1k | human /1k | delta (95% CI) | discriminates |
| --- | --- | --- | --- | --- |
| all rules | 43.7 | 40.0 | +3.69 ±1.79 | 63% |
| `ai-style` only | 22.2 | 18.2 | +4.01 ±1.39 | 65% |
| `reader-first` only | 21.5 | 21.8 | **-0.32 ±0.72** | **46%** |
| all minus `sentence-load` | 30.0 | 26.5 | +3.48 ±1.60 | 64% |
| **`ai-style` + `aside-pileup`** | 25.6 | 20.8 | **+4.76 ±1.44** | **70%** |

`reader-first` fires marginally harder on the humans. `sentence-load` alone was
a third of all findings, at 12.9/1k on slop against 13.2/1k on human prose. The
cheapest way to cut it is to chop sentences, which is what the reward was
really paying for. That is the root cause of both open defects at the time:
v7 cut 29% of the words, and it never reached a stable point because a sentence
can always be chopped again.

At n=40 this comparison ranked all-rules first. It took n=250 to resolve. Do
not re-run this test at small n and trust the answer.

`config.json` now sets `scoredRules` to `["ai-style", "reader-first/aside-pileup"]`.
Every rulepack still runs. `scoredRules` decides what gets **priced**, not what
gets looked at, so the product still reports everything.

### The human band had to move with it

Percentiles of weighted findings per 1k over 250 untouched human originals.

| priced rules | p10 | p25 | p50 | p75 | p90 |
| --- | --- | --- | --- | --- | --- |
| all rules | 22.6 | 26.3 | 31.7 | 36.7 | 42.8 |
| `ai-style` + `aside-pileup` | 6.8 | 9.7 | **12.5** | 15.2 | 20.2 |

Band moved from `[17, 36]` to `[7, 15]`, and `lintSpan` from 10 to 4. Leaving
the old band would have put most human prose below its own floor and paid the
model to add findings back in.

### The reward was indifferent to drift

Scoring v7's own outputs against themselves. 155 verbatim-copy rows against
155 lightly-churned rows.

| reward version | copy wins | mean gap | median gap |
| --- | --- | --- | --- |
| old rules, flat gate | 35% | +0.042 | **+0.000** |
| old rules, flipped gate | 94% | +0.140 | +0.094 |
| new rules + new band | 88% | +0.133 | +0.079 |

The raw echo rates were 1.000 for the copy and 0.891 for the churn. The signal
was always there. The clean-source exemption was throwing it away. A median gap
of exactly zero means a GRPO group rolled out on finished text has no advantage
between its members and teaches nothing.

### Drift across passes

n = 155 rows over 63 documents.

| arm | input to p1 | p1 to p2 mean | p1 to p2 median | p2 to p3 | length ratio |
| --- | --- | --- | --- | --- | --- |
| base | 61.4% | 6.0% | 3.2% | 2.5% | 0.710 |
| v7 | 71.9% | 10.9% | 7.5% | 4.0% | 0.704 |
| **v9** | 52.7% | **5.3%** | **0.3%** | **1.6%** | **0.951** |

v9 is stage-1 SFT with self-target examples mixed in at 25%, repair-only,
1 epoch, 369 steps, final `eval_loss` 1.078.

### Pass-1 quality, and the ranking bug it exposed

| arm | src /1k | out /1k | echoRate | anchors | length | reward | in band | below |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| base | 16.2 | 9.8 | 0.386 | 0.863 | 0.710 | 0.405 | 47% | 39% |
| v7 | 16.2 | 7.5 | 0.281 | 0.896 | 0.704 | **0.409** | 39% | 54% |
| v9 | 16.2 | **13.9** | 0.473 | **0.960** | **0.951** | 0.372 | **55%** | **9%** |

v9 won every quality measure and scored last. The sources average 16.2/1k
against a band top of 15, so they barely need work, yet the hard-edged gate
demanded the same rewriting it would ask of filthy text.

After the `echoWorkSpan` blend, with the **document** as the independent unit
(n=63, draws averaged):

| arm | reward before | reward after |
| --- | --- | --- |
| base | 0.420 ±0.055 | 0.341 ±0.050 |
| v7 | 0.418 ±0.055 | 0.301 ±0.045 |
| **v9** | 0.390 ±0.076 | **0.354 ±0.071** |

Honest reading: the fix stops the reward ranking the best model last, which was
a blocking defect. It does not make the reward sharp. v9 beats v7 on 52% of
documents at +0.053 ±0.089, and beats base on 48% at +0.013 ±0.074. Both
intervals span zero.

## Known defects

- **`drift-report.ts` treats rows as independent.** The benchmark has 155 rows
  over only 63 unique document ids, about 2.5 draws each. Every drift
  confidence interval reported before 2026-08-22 is too narrow. The point
  estimates hold. Fix by averaging draws inside a document first.
- **The reward cannot separate the three arms** at n=63. See above.
- **The warm-start path has never run.** `--init-adapter` in `train_grpo.py`
  has no execution behind it. Smoke it at 25 steps under a throwaway
  `run_name` before any real run, so the smoke checkpoint is not resumed by
  the full run.
- **`runs/pr-eval/` holds six duplicate copies** of the same PR document.

## Guardrails that must not be quietly broken

- **Re-measure the human band whenever `levelWeights`, `scoredRules`, or the
  corpus changes.** Two tests in `test/findings.test.ts` fail loudly if you
  change one without the other. They have already caught this once.
- **slopsift is pinned in `train_grpo.py`,** not floated. The band is p10-p75
  as measured by one version of the rules. Floating the version silently
  redefines the target. 0.9.0 also needs Node 24 while the image ships Node 22,
  so `latest` would have installed a slopsift that cannot run at all.
- **`score_batch` swallows failures on purpose,** so one bad batch cannot kill
  an eight-hour run. The cost is that a scorer broken from step 1 looks exactly
  like a terrible policy. The preflight probe in `train_grpo.py` exists to
  catch that, and it checks the shape of the result rather than its value,
  because a verbatim copy legitimately scores zero.
- **Self-prompts come from `passes[1]`, never `passes[0]`.** `drift_modal.py`
  seeds its history array with the source, so `passes[0]` is the slop that went
  in. Reading index 0 would feed slop back as "the model's own output" and
  teach nothing. This bug was written once already.
- **The rewriter and generator models must never learn about slopsift or this
  repository.** Sources have to carry each model's real habits.

## What to do next

Recommended order, and the reasoning behind holding the GRPO run.

Two facts changed the picture. v9 already meets the drift target from
supervision alone, at 0.3% median. And the reward cannot rank the arms. GRPO
consumes something narrower than the between-arm comparison above: the reward
spread between rollouts of a **single** prompt. If that spread is near zero,
every advantage is zero and 500 steps teach nothing.

1. **Commit the `echoWorkSpan` blend.** Done in the same commit as this file.
2. **Fix `drift-report.ts`** to average draws within a document. Costs nothing,
   and every drift interval is wrong until it lands.
3. **Measure the fuel.** Sample 8 rollouts per prompt over about 40 prompts
   from `qwen3-8b-sft-v9/final` at temperature 0.7, score them through
   `src/cli/score.ts`, and take the median within-group reward standard
   deviation. About one H100-hour, roughly $3. Rewards sit near 0.35 and the
   arms differ by about 0.05, so a within-group std under roughly 0.02 means
   there is nothing for GRPO to climb.
4. **Branch on that number.**
   - Real spread: 25-step warm-start smoke test, then the full run. About six
     H100-hours and $30.
   - Flat: GRPO is the wrong tool at this operating point. Spend the money on
     the reward or on wider self-target supervision instead.

Worth weighing separately: **v9 may be the thing to ship.** Its mean pass-2
drift is 5.3% while its median is 0.3%, so a small tail of documents is doing
all the damage. Reading those tail documents costs nothing and may show the
remaining instability is one recognisable failure that supervision can fix.

### Held ready, not yet run

- `runs/self-gen-inputs.jsonl` holds 1,400 GRPO slop sources, benchmark-excluded
  and seeded-shuffled. Feed it to `drift_modal.py --passes 1` to make v9's
  first-pass outputs. `drift-v9.jsonl` alone yields only about 149 usable
  self-prompts and roughly 1,000 are needed.
- Then rebuild the prompt set with
  `grpo-prompts.ts --self runs/drift-v9-selfgen.jsonl --self-share 0.25`.

## Carry-over

- `train/MODEL_CARD.md` still has `NUMBERS_PENDING` and `REPO_ID` placeholders.
  `train/space/app.py` has `REPO_ID` too.
- The Space needs a degenerate-output guard.
- Faithfulness is measured on anchors. A claim-level check is still missing.
- Issue #58: sweep for registered rules with no positive fixture.

## Budget

$100 global cap, tracked in `runs/cost-ledger.jsonl`. $60.72 spent over 4,814
OpenRouter calls. Modal spend is separate and sits around $15 to $20.

Hugging Face is deferred until the results are good enough to publish. The
token is created by hand with `modal secret create huggingface-token
HF_TOKEN=<write token>` and never touched by an agent.
