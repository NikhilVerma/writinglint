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

### One band could not serve both kinds of writing

`[7, 15]` was measured on blog essays and then enforced on release notes and
pull-request descriptions, which are a different kind of prose. Ordinary human
technical writing was being told it was slop.

| corpus | p50 | p75 | p90 | mean `work` | `work` at 1.0 |
| --- | --- | --- | --- | --- | --- |
| 250 human essays | 11.6 | 15.5 | 20.2 | 0.09 | 3% |
| 125 PR and release notes | 16.4 | 23.3 | 30.2 | 0.30 | 12% |

The echo floor was wrong in both directions for the same reason. A legitimate
essay rewrite echoes 0.11 of its source at the median, so a floor of 0.35 paid
full anti-copy credit to a rewrite doing half the work. A legitimate technical
rewrite echoes 0.74, because names and numbers have to survive, so the same
floor charged a faithful one 60% of its credit.

Anchors per 100 words separate the two cleanly, and nothing else was needed:
essays reach 3.5 at the 95th percentile, technical documents sit at 13.1 at the
median, and 98% of them clear 4. The threshold is 4 and sits in a wide gap.

| domain | band | echo floor |
| --- | --- | --- |
| prose | `[7, 15]` | 0.25 |
| technical | `[2.5, 16.8]` | 0.75 |

### Most of the technical band was contamination

The technical band was first measured on current pull requests and came out at
`[3, 23]`. Then somebody looked at what those documents actually were.

| marker in the body | documents |
| --- | --- |
| "Generated with [Claude Code]" | 24 / 639 |
| GitHub's generative-AI disclosure prompt | 48 / 639 |
| Copilot | 12 / 639 |

Those are only the ones that declare it. So the reward was calibrating "human
technical writing" partly on machine writing, and then paying a rewriter to
imitate it.

Re-fetched from the same twelve repositories, restricted to pull requests
**merged between 2018-01-01 and 2019-12-31**. GPT-2 shipped in February 2019
and GPT-3 not until June 2020, so nothing in that window was machine-written at
any scale, while pull-request prose had already settled into its modern shape.
Going back to 2013 costs more than it buys, because pull-request bodies then
were mostly one line.

| corpus | p10 | p25 | p50 | p75 | p90 | AI markers |
| --- | --- | --- | --- | --- | --- | --- |
| current PRs (n=639) | 5.9 | 12.2 | 19.6 | 29.3 | 39.5 | 84 |
| **2018-19 PRs (n=561)** | **2.5** | 6.8 | **10.3** | **16.8** | 27.4 | **0** |

Every percentile drops, and the gap survives both controls: same three
repositories gives 10.3 against 16.0, and length-matched at 150-500 words gives
10.6 against 15.8.

The technical median of 10.3 now sits **below** the essay median of 11.6. The
premise the domain split was built on — that technical writing is inherently
denser in findings — was false. Technical writing is *wider*, spanning 2.5 to
16.8 where essays span 7 to 15, and that is the only real difference. The rules
were right the whole time and the corpus was lying.

Band moved to `[2.5, 16.8]`. `band-measure.ts` exists now so this can be
re-checked whenever the corpus or the pricing moves; nothing did that before,
and `measure-corpus.ts` looks like it does but reports raw unfiltered findings
in units that are not band units.

Two anchor bugs fell out of measuring this. Number words were read on both
sides of the comparison, which made every essay anchor-dense on words carrying
no fact: 19% of all anchors and **40% of every dropped-anchor penalty** came
from "one" through "twelve". They are now read on the output side only, with a
loose source reading kept purely as the reference for what counts as invented,
because dropping them everywhere scored a verbatim copy at 0.65 faithfulness.

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

n = 155 rows over 63 documents, averaged inside each document.

| arm | input to p1 | +/-95% | p1 to p2 | +/-95% | median | p90 | p2 to p3 | length |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| base | 58.3% | 4.8 | 6.7% | 1.6 | 4.6% | 15.8% | 2.8% | 0.988 |
| v7 | 69.7% | 3.4 | 11.1% | 2.6 | 7.9% | 27.6% | 4.2% | 0.985 |
| **v9** | 44.1% | 7.1 | **4.8%** | 2.3 | **0.6%** | 19.1% | **1.7%** | **0.996** |

v9 is stage-1 SFT with self-target examples mixed in at 25%, repair-only,
1 epoch, 369 steps, final `eval_loss` 1.078. Its p90 of 19.1% is the real
story: the median is a fixed point and a tenth of documents still churn a
fifth of their words on pass 2.

## The half of the eval that did not exist

Drift answers "does it leave finished text alone". Nothing answered "does it
clean dirty text at all", and v9 was declared a success on drift alone.
`clean-report.ts` answers the second question, and it reverses the verdict.

Everything below is per document, split two ways that both turned out to be
load-bearing: by domain, because the bands differ, and by whether the
**source** was above its band, because averaging a document that needed work
with one that did not describes neither.

### Dirty prose (68 rows / 42 docs, source at 21.6/1k)

| arm | out /1k | cut | dirtier | faith | invented | reward |
| --- | --- | --- | --- | --- | --- | --- |
| copy | 21.6 | 0.0 | 0% | 1.000 | 0.00 | **0.032** |
| base | 11.5 | 10.1 | 6% | 0.885 | 0.29 | 0.325 |
| **v7** | 9.4 | **12.2** | 0% | 0.934 | 0.35 | **0.346** |
| v9 | 15.9 | 5.7 | **21%** | 0.989 | 0.33 | 0.245 |

### Clean prose (71 rows / 44 docs, source at 11.2/1k)

| arm | out /1k | cut | dirtier | faith | invented | reward |
| --- | --- | --- | --- | --- | --- | --- |
| copy | 11.2 | 0.0 | 0% | 1.000 | 0.00 | **1.000** |
| v9 | 10.9 | 0.3 | 37% | 0.955 | 0.62 | 0.342 |
| base | 8.4 | 2.8 | 20% | 0.895 | 0.32 | 0.295 |
| v7 | 6.5 | 4.7 | 13% | 0.930 | 0.37 | 0.201 |

Both tables read correctly, which is the point of the split: on dirty text a
copy is worthless and v7 wins, on finished text a copy is the right answer and
v9 comes closest to it. **v7 is the better model under the corrected reward.**
v9 cuts less than the untuned base and leaves a fifth of dirty documents worse
than it found them.

### Technical, where it gets embarrassing

16 rows over 10 documents, so treat these as a flag rather than a measurement.

| arm | invented anchors per doc | docs that came out dirtier |
| --- | --- | --- |
| base | 0.39 | 18% |
| v7 | 0.39 | 9% |
| **v9** | **1.56** | **64%** |

v9 invents numbers in release notes and pull-request descriptions and adds slop
to two thirds of them. It had **no technical training data at all**. This is the
concrete publish risk, and it is a data gap rather than a reward defect.

## The reward paid for doing nothing

Found by scoring a verbatim-copy arm, which had never been scored before.
On the mixed benchmark a copy took **0.631** against 0.352 for the best trained
model. A stage-2 GRPO run on that reward would have learned to hand the input
straight back.

The cause was in the lint term, not the echo gate. Above the band it measured
progress from an inflated starting point rather than from the source, so a copy
of a document at 16.2/1k collected 0.70 of the term for free. The numerator is
now the cut actually made, so a copy closes nothing and scores nothing;
`lintSpan` survives only as a floor on the denominator. A test now asserts
`lint(dirt, dirt) == 0` at four dirt levels.

Even after the fix the mixed mean read 0.533, because 45% of the benchmark is
already in band where a copy correctly scores 1.0. That is what forced the
clean/dirty split above. Split properly, a copy scores 0.032 on dirty prose.

## The data was the ceiling

The single most useful measurement of the project. Every SFT pair was scored on
the reward's own metric (`pair-quality.ts`, n=3,444):

| | mean | median | p10 | p90 |
| --- | --- | --- | --- | --- |
| gap taught, all pairs (v9's data) | **2.6** | 2.5 | -6.0 | 12.0 |

34% of pairs have a target **dirtier** than its input. v9 was taught a 2.6/1k
cleanup and delivers 5.7/1k on dirty prose. It learned its data almost exactly.
No amount of reward tuning fixes that. The fix is the data.

Failure modes, on the 1,680 pairs scored at the time of the breakdown:

| | share |
| --- | --- |
| weak cut, because the source was already clean | 48% |
| usable repair | 31% |
| weak cut and the target is still dirty | 16% |
| good cut but the target is still above band | 4% |

Half the corpus gave the fixer nothing to do. Where the source really was dirty,
53% of the time it produced a real repair. Those are the examples worth keeping.

### Reversing the arrow: corrupt the human text instead

The fixer approach asks a model to clean slop, and models are bad at that even
when told exactly what to remove. Going the other way is easy: hand a model
real human prose and ask it to write badly. The human original becomes the
target, the corrupted version becomes the input, and the pair is correct by
construction rather than by a judge's opinion.

The source corpus is 561 pull-request bodies merged between 2018-01-01 and
2019-12-31 — before GPT-3 existed, so the writing is human by provenance and
not by filter. 15 Claude subagents, alternating Sonnet and Opus, each corrupted
38 documents. Each agent got one heavy habit plus two light ones, rotated by
index, from five clusters: rhetorical scaffolding, hedging and vagueness,
throat-clearing and hollow structure, assistant register, density and syntax.
The habits were described as plain writing instructions and never by rule name,
so nothing about the linter reached the generator. Hard rules: keep every fact
and identifier, invent nothing, grow 1.3-1.8x, leave code blocks alone, output
only the document.

15/15 agents, 0 errors, 559 files, 982 seconds, no OpenRouter spend.

`corpus-check.ts` validates every pair on three questions: do the facts
survive, did slop actually land, did any tooling leak.

| | value |
| --- | --- |
| slop added, mean | **14.0**/1k (median 13.0) |
| anchors kept | 0.999 |
| anchors invented | 0.09 |
| length grew | 559/559, mean 1.42x |
| **pass** | **410/559 (73%)** |

Rejected: 146 too weak (under 5/1k), 1 unfaithful, 2 leaked. Against the fixer
pipeline's 2.6/1k at 31% usable, this is about five times the signal at more
than twice the yield.

The contrast is itself a finding. A model rewriting an essay in its own words —
not trying to be bad — adds 2.6 findings per 1k. A model deliberately writing
badly adds 14. The reward is being trained on both, which is the intent.
Flagged confound: natural slop currently appears only in essays and deliberate
slop only in technical text, so "domain" and "how the slop got there" are not
yet separable. Fixing that means naturally rewriting a slice of the 2018 docs.

### v10

`sft-dataset.ts` keeps a repair pair only when the cut is at least 5/1k, the
target lands inside its own domain band, and the target is not a near-copy of
its input. Corrupted technical pairs are wired in as a second source for the
first time.

| | rows | mean gap taught | median | targets dirtier |
| --- | --- | --- | --- | --- |
| essay repair | 869 | **10.7** | 9.1 | 0% |
| technical repair | 329 | **19.8** | 19.1 | 0% |
| self-target (exact identity) | 290 | n/a | n/a | n/a |
| **train total** | **1,488** | | | |

Holdout is 57 rows, built the same way and carrying the same mix. Verified:
every self-target row is an exact identity pair, no holdout id appears in
train, none of the 120 benchmark documents appears in train, and no row
mentions slopsift or this repository. Four rows still match the leak regex and
all four are ordinary human prose ("I rewrote my function", "the original
post"); the two real hits were a generator preamble baked into an essay input,
now stripped at source.

Set against v9's data, which taught a 2.6/1k cut with 34% of targets dirtier
than their input, v10 teaches a 10.7 to 19.8/1k cut with none.

The prediction this sets up, to be checked and not assumed: v10 should cut like
v7 on dirty text, because that is what its data now teaches, while the identity
rows hold it steady on finished text the way v9 is. The risk to watch is the
opposite failure — the technical half teaches a 19.8/1k cut, nearly twice the
essay half, and 22% of train is technical. If v10 over-cuts, that is where it
came from.

## v10 measured: it learned to under-edit

Trained 2 epochs on the 1,488-row corpus, eval loss 0.944 at epoch 1 and 0.950
at epoch 2 (a mild overfit; one epoch may be enough). Scored on a rebuilt
benchmark of 215 rows over 123 documents, which for the first time carries a
real technical half: 54 prose documents (38 above band) and 69 technical (39
above band), against the old benchmark's 10 technical documents.

Every number below is on that v2 benchmark. Earlier tables in this document are
on the 63-document v1 benchmark and are not comparable.

Cut, in weighted findings per 1k, on sources that were above their band:

| arm | prose | technical | prose dirtier | tech dirtier | tech still above band |
| --- | --- | --- | --- | --- | --- |
| base | 8.7 | 6.8 | 9% | 33% | 56% |
| v7 | **12.3** | **9.5** | 0% | 15% | 28% |
| v9 | 1.1 | -1.1 | 19% | 59% | 92% |
| v10 | 5.8 | 1.4 | 4% | 23% | **97%** |

Drift across passes:

| arm | input->p1 | p1->p2 | p2->p3 |
| --- | --- | --- | --- |
| base | 44.0% | 6.0% | 2.3% |
| v7 | 58.5% | 12.9% | 5.9% |
| v9 | 25.5% | 3.4% | 1.3% |
| v10 | 20.0% | 1.5% | **0.1%** |

v10 is the best fixed point trained so far and the second-weakest cleaner. Its
median input->p1 drift is 0.0%: for more than half the benchmark it returns the
input unchanged.

### The transfer hypothesis was wrong

The first explanation was that corruption teaches deletion — corrupted documents
are 1.42x inflated and the human target is 0.70x the corrupted length — so the
learned move would find nothing to delete in naturally sloppy prose. That
predicts v10 cleans held-out CORRUPTED documents well and natural ones badly.

Measured on 60 held-out corrupted documents (`drift-inputs-heldcorrupt.jsonl`),
none of them in training, all with a real corruption gap:

| arm | prose cut | tech cut | still above band | invented (prose) | p2->p3 |
| --- | --- | --- | --- | --- | --- |
| v7 | **25.3** | **26.2** | 48% / 26% | **1.82** | 14.8% |
| v10 | 12.4 | 10.1 | 80% / 84% | 0.07 | 0.3% |

v10 underperforms v7 by half on the exact distribution it was trained on, so
transfer is not the problem. It under-edits everywhere, at echo 0.833 on prose
it was trained to clean. The likelier cause is composition: 290 exact-identity
rows plus 132 technical pairs above 0.8 echo is 28% of training rows whose
correct answer is to hand the document back.

Caveat on the comparison: v7 is GRPO-trained against the reward, v10 is SFT
only. SFT reproduces its data; GRPO optimises the objective directly. v10 is
the SFT stage of a two-stage plan, and comparing its cut magnitude against a
reward-optimised policy flatters v7.

### What the in-distribution run exposed about v7

v7 invents **1.82 anchors per corrupted prose document** and churns 26.5% on
its second pass and 14.8% on its third. On heavily padded input it fabricates
numbers and identifiers at scale. It is the hardest cleaner in the series and
the least trustworthy, and the small benchmark hid this. On the v2 benchmark it
also cuts 4.6/1k out of prose that was ALREADY clean and returns it at 0.693 of
its length — it strips a third of finished text.

None of base, v7, v9 or v10 is publishable.

## Ideas that were measured and rejected

- **Chunked cosine similarity as an echo or faithfulness gate.** The hypothesis
  was that 4-gram overlap cannot tell rewriting from synonym-swapping, so
  semantic drift would expose v7's churn as empty. It does not. Measured with a
  pinned MiniLM over all three arms, the ratio of semantic to lexical drift is
  nearly flat: base 0.82, v7 0.86, v9 0.89. Every model changes words far more
  than meaning, including the untuned one, so the ratio separates nothing.
  Chunk coverage (0.791 / 0.766 / 0.886) does order the arms, but in the same
  order `echoRate` already gives. Not worth a GPU dependency in the reward.
  `train/semantic_probe.py` keeps the measurement reproducible.

## Known defects

- **v9 must not be published.** It cuts less than the untuned base model on
  dirty text, leaves 21% of dirty prose documents worse than it found them, and
  invents 1.56 anchors per technical document. It is stable and it is not good.
- **The technical benchmark is 16 rows over 10 documents.** Every technical
  number here is a flag, not a measurement. `runs/drift-inputs-v2.jsonl` holds
  215 inputs including 60 held-out technical documents and needs a GPU pass.
- **The warm-start path has never run.** `--init-adapter` in `train_grpo.py`
  has no execution behind it. Smoke it at 25 steps under a throwaway
  `run_name` before any real run, so the smoke checkpoint is not resumed by
  the full run.
- **Every technical number predates the band move.** The technical band went
  from [3, 23] to [2.5, 16.8] once the corpus was decontaminated, so base, v7
  and v9's technical rows all need re-scoring before they can be compared with
  v10.
- **Slop provenance is confounded with domain.** All natural LLM slop in the
  training mix is essays; all deliberate slop is technical. The model cannot
  be shown to generalise across that split until a slice of the 2018 documents
  is rewritten naturally too.
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

The order changed. GRPO is no longer the next thing, because stage 1 is where
the loss is: v9 was trained on data that taught a 2.6/1k cleanup, and a reward
that paid 0.631 for doing nothing would have made stage 2 worse, not better.

1. **Train v10 on the filtered dataset.** 1,317 rows, built and verified. One
   epoch, same recipe as v9. About one H100-hour.
2. **Run both halves of the eval on `drift-inputs-v2.jsonl`,** which carries
   real technical documents. Report `clean-report.ts` split by clean and dirty
   source alongside `drift-report.ts`. A model is only shippable if it cuts
   like v7 on dirty text and holds like v9 on clean text, with invented anchors
   at base level or below.
3. **Only then measure GRPO fuel.** Sample 8 rollouts per prompt over about 40
   prompts at temperature 0.7, score them, take the median within-group reward
   standard deviation. Under roughly 0.02 there is nothing to climb and the
   money belongs in supervision instead. The corrected lint term should widen
   this spread, because a copy and a real cut no longer score alike.
4. **Branch on that number.** Real spread: 25-step warm-start smoke, then the
   full run, about six H100-hours. Flat: more and better stage-1 data.

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
- Faithfulness is measured on anchors, so a dropped argument is invisible to
  it. Chunk coverage from `semantic_probe.py` is the cheapest candidate: v7's
  10th percentile sits at 0.671, which is the tail where source content really
  is being dropped. Rejected as a general gate, possibly useful as a floor.
- Issue #58: sweep for registered rules with no positive fixture.

## Budget

$100 global cap, tracked in `runs/cost-ledger.jsonl`. $60.72 spent over 4,814
OpenRouter calls. Modal spend is separate and sits around $15 to $20.

Hugging Face is deferred until the results are good enough to publish. The
token is created by hand with `modal secret create huggingface-token
HF_TOKEN=<write token>` and never touched by an agent.

## v11: the prompt is nearly inert under supervised fine-tuning

v10 was under-instructed and inconsistently instructed. The prompt taught ten
generic plain-English improvements while the reward priced 48 specific habits,
and the model had never been shown the rubric it was graded on. Worse, only 419
of its 1,488 rows carried that prompt at all: the 869 essay-repair rows passed
the export's turn list straight through, so two thirds of the corpus trained
under the prompt the GENERATOR had run under.

v11 fixed both. `prompts/rewrite-sft-v3.md` names every priced habit in plain
writing advice, grouped into five themes, in about 1,070 tokens, and the dataset
now reads its system prompt from a file instead of inheriting it from row zero
of the corpus. Identity targets dropped from 25% of the pool to 10%, which took
near-identity rows from 29% of the corpus to 18%.

The result, counted per rule over the 123 benchmark documents:

| rule | input | v7 | v10 | v11 |
| --- | --- | --- | --- | --- |
| absolute-claim | 913 | 441 | 672 | 629 |
| evidence-cluster | 773 | 176 | 625 | 636 |
| passive-actor-hiding | 758 | 482 | 661 | 658 |
| filler-intensifiers | 106 | 3 | 53 | 61 |
| rule-of-three | 54 | 13 | 63 | 68 |
| passive-voice-density | 52 | 19 | 46 | 53 |
| TOTAL | 3838 | 1884 | 3097 | 3018 |

Naming all 48 habits bought 2.5%. Four of the habits named explicitly came out
worse than in v10. v7 was never told a single rule and removes half of
everything, because it was scored on them rather than instructed about them.

That is the finding, and it is worth more than the model: under SFT the system
prompt barely reaches the behaviour. The model imitates what its targets do, not
what its prompt says. Clear rules do produce better output, but the channel that
carries a rule to the model is the reward, not the instruction.

The aggregate numbers moved the way that implies. Cut on dirty prose went 5.8 to
6.9 with a 2.5 confidence interval, so the gain is real only in sign. The fixed
point held: 22.5% on pass 1, 1.8%, then 0.3%.

### v11 is more faithful than base, not just more timid

Base cuts 8.7 on dirty prose against v11's 6.9, which reads as an argument that
the whole corpus is net-harmful. It is not. Base buys that cut by deleting: it
keeps 0.889 of the source anchors and 0.740 of the length. v11 keeps 0.993 and
0.945. Base removes findings by removing the text they live in, which the
faithfulness term is there to forbid. The gap between them is damage, not skill.

v11 still under-edits. Both things are true.

### The technical half did not move, and no prompt will move it

Echo on dirty technical documents is 0.963: v11 hands a current pull-request
description back nearly verbatim, and 97% stay above their band. On the held-out
CORRUPTED technical set it cuts 12.2. Same model, same prompt, opposite result.

The 329 technical rows are corrupted-2018 pull requests paired with their clean
originals, so they teach targeted repair of injected corruption. The benchmark
asks for cleaning of natural slop in modern pull requests. That is a distribution
gap in the corpus, and instruction cannot close it.

### What follows

GRPO starting from v11 rather than from base. v7 proved the reward teaches these
habits; its failures were inventing 1.82 anchors per corrupted prose document and
never converging, at 14.8% churn on pass 3. v11 answers both directly, at 0.15
invention and 0.3% churn. A faithful, converged starting policy is the one
configuration never tried.

Build the real technical pairs first. They are cheap, they run on OpenRouter
rather than Modal, and they close the only gap that a reward run would otherwise
inherit.

## v12: removing the wrong training data beat adding more instruction

The plan above was to build real technical pairs before any reward run. We did
the opposite, and the reason is that the synthetic pairs turned out to be
measurably the wrong input rather than merely a thin one.

Weighted findings per 1k, by rule family:

| | synthetic corruption | real AI rewrites | benchmark |
| --- | --- | --- | --- |
| total | 38.8 | 24.1 | 21.3 |
| passive-actor-hiding | 17.44 | 2.73 | 4.15 |
| ai-vocabulary | 1.50 | 0.18 | 0.28 |
| absolute-claim | 2.21 | 5.70 | 5.08 |
| filler-intensifiers | 0.15 | 2.31 | 0.44 |

The corruption script hides the actor six times more often than a real AI
rewrite does, and makes half as many absolute claims. A model trained on it
learns to hunt passives and to ignore the habits that actually show up. So v12
drops the 329 synthetic rows entirely: 966 rows, 869 repair and 97 self-target.

Scored on the 123 documents v11 was scored on, so the pools match:

| | v11 | v12 |
| --- | --- | --- |
| prose dirty: cut | 6.9 | 5.6 |
| prose dirty: landed in band | 51% | 59% |
| prose: came out dirtier | 6% | 10% |
| technical dirty: cut | 0.9 | 2.5 |
| technical: still above band | 97% | 90% |
| technical dirty: reward | 0.060 | 0.136 |
| technical: echo | 0.963 | 0.928 |
| drift p1 -> p2 | 1.8% | 2.5% |

The technical half was inert in v11 and is no longer inert. Cut nearly triples
and echo falls. It is still bad in absolute terms, but it responds.

The prose cut falling from 6.9 to 5.6 is not the regression it looks like. Cut
is the means; landing inside the human band is the goal, and that rose from 51%
to 59%. v12 removes less because it overshoots less often.

Two marks against it. Prose documents that come out dirtier rose from 6% to 10%,
and pass-two churn is 2.5% against the 2% target v11 met at 1.8%. v12 cleans
better and holds still slightly worse. The reward pays for both terms at once,
which is what the run starting from v12 is meant to settle.

Note what this says about the earlier finding. Naming all 48 habits in the
prompt moved per-rule totals by 2.5%. Removing 329 rows of the wrong data moved
the dead half of the benchmark on its own. Under supervised fine-tuning the data
is the instruction.

## The reward run pays more for doing nothing than for doing the work

Fifty steps of GRPO warm-started from v12 made the model edit LESS. Scored on
the 123 benchmark documents:

| | v12 | after 50 reward steps |
| --- | --- | --- |
| prose dirty: landed in band | 59% | 46% |
| technical dirty: cut | 2.5 | 1.3 |
| technical dirty: echo | 0.928 | 0.975 |
| drift input -> p1 | 22.4% | 14.2% |
| drift p1 -> p2 | 2.5% | 1.7% |

It improved at everything whose right answer is "leave it alone" and got worse
at the thing it exists to do.

The cause is in the prompt set, not the policy. Of 1,664 logged rollouts, 40%
were drawn from sources already inside their band:

| | mean reward |
| --- | --- |
| near-verbatim copy of an in-band source | 0.803 |
| genuine attempt on a source that needs work | 0.184 |
| near-verbatim copy of a source that needs work | 0.038 |

Copying clean text is the highest-paying action available, by a factor of four.
Cleaning risks the faithfulness and echo terms; copying something already clean
risks nothing. The reward is not wrong — leaving good writing alone IS correct —
but a set that is 40% free money teaches inaction. Capped at 15%.

Removing the free rewards exposes the real problem. On the filtered set the
policy edits much harder and starts dropping facts: echo 0.616 -> 0.468,
faithfulness 0.741 -> 0.620 with 20% of rollouts scoring zero on it. That is the
problem the reward run has to solve, and it was invisible while 40% of prompts
could be answered by doing nothing.

### The per-step reward line cannot see any of this

Each step draws four prompts, so consecutive means differ mostly by which four
documents came up. Fifty-two steps swung between 0.23 and 0.39 with no trend,
while the gradient was healthy the whole time: within-prompt reward spread 0.19,
best-of-eight 0.591 against a 0.330 mean, and only 5% of prompt groups carrying
no gradient at all. The signal was there; the instrument could not see it.

So the run now scores the same twelve held-out documents every fifteen steps
under greedy decode, and stops itself after two probes that fail to beat the
best by 0.02. Two consecutive probes on an unchanged policy return an identical
0.550, which is the property the per-step line never had.

The probe is instrumentation and is wrapped so it can never fail the job. The
first version raised inside on_step_end at step 14, and because the function
retries five times on cancellation, a bug in the measurement was about to be
bought five times over for a run that had produced nothing.

## v14 plateaued because the training pool was easier than the benchmark

Under both rulepacks, v14 and the base 8B are the same model on prose:
cut 25.7 +/-2.7 vs 26.0 +/-2.8, in band 71% vs 69%, faithfulness 0.893 vs
0.909. Two years of pipeline and the adapter is a rounding error away from
what it started from. That is the whole reason v15 exists.

The evidence chain, in order:

1. Training prose sits at 21.1 weighted findings per 1k. The benchmark's
   prose sits at 31.3.
2. That gap is not an artefact of the best-of-n filter. Keep rate by
   difficulty band is 53% / 77% / 76% / 67% — flat. The filter is not
   throwing hard documents away.
3. The benchmark's prose is two populations: 40 deliberately corrupted
   documents at 39.9 per 1k, and 54 real essays at 19.1. The training pool
   matches the real essays almost exactly. Half the graded slice is a kind of
   document the model has never once been shown.
4. Self-distillation is not the ceiling. On that hard slice, best-of-8
   headroom is 5.13 +/-1.25 over the average sample, and faithfulness is
   BETTER at best-of-8 than at the mean (0.938 vs 0.909). The data was the
   ceiling, again.

This is the documented failure mode for synthetic training data in error
correction: when the synthetic error distribution does not cover the errors
seen at test time, correction ability degrades, and matching the error TYPE
distribution matters more than matching the error RATE.

## Both rulepacks are now paid for, and one rule inside a paid pack is not

`reader-first` was demoted to unscored during the v7 chopping pathology. The
demotion outlived its cause: the band-with-taper reward already fixed the
"pay all the way to zero" behaviour that made v7 delete 29% of the words.
Measured on 400 documents paired with the human original they were made from:

| rule                        | slop | human | paired difference |
| --------------------------- | ---- | ----- | ----------------- |
| reader-first/sentence-load  | 14.9 | 13.7  | +1.24 +/-0.27     |
| reader-first/aside-pileup   |  4.2 |  3.4  | +0.79 +/-0.19     |
| ai-style/passive-actor-hiding | 0.9 | 1.1  | -0.18 +/-0.10     |

`sentence-load` is the single biggest finding family in the corpus and it
discriminates. It is now paid. `passive-actor-hiding` fires HARDER on the
human original; paying to remove it teaches the model to write less like a
person. It is now named in `unscoredRules`. A rulepack is the right unit to
enable and the wrong unit to trust.

## The two corpora fail differently, which is why v15 uses both

Weighted findings per 1k, by rule:

| rule                        | benchmark | 8B corruption | stronger-model slop |
| --------------------------- | --------- | ------------- | ------------------- |
| reader-first/sentence-load  | 14.60     |  9.08         | 14.92               |
| reader-first/aside-pileup   |  4.26     |  3.24         |  4.19               |
| ai-style/throat-clearing    |  1.04     |  3.73         |  0.02               |
| ai-style/chatbot-idioms     |  1.13     |  2.22         |  0.15               |

The stronger model reproduces the structural habits an 8B cannot manufacture.
The 8B overshoots the lexical tells the stronger model never adds, and which
are absent from every human corpus by construction. Neither alone covers the
benchmark. Measured over 200 seeds, the 8B corruption pass moves text from
29.0 to 36.5 per 1k (p50 36.1, p75 42.8) at 1.17x length and only 2% of
documents come out shorter — it spoils style rather than deleting content.

### v15 stop rule

Prose-dirty cut >= 28.0 with faithfulness >= 0.909. The base is 26.0 at
0.909. Measured headroom says best-of-8 reaches past that, so it is inside
reach and not free. If v15 misses it, the next lever is the target, not more
data — see below.

## Human originals are bad targets under this reward

Scoring 3120 human pairs on the reward metric: the human original cuts only
2.2 per 1k below the slop it was spoiled from (median 2.6), and on 37% of
pairs the human "answer" is DIRTIER than the input. Even on the hard slop
(n=558, 41.0 per 1k) the human cuts 10.0. The base 8B's own best-of-8 cuts
26. Training on human targets is training the model down. Self-distillation
is not a compromise here, it is the stronger signal.

Overlap between the human target and its slop input is 0.13, so this is not
a copying problem hiding as a quality problem. The human simply writes to a
different objective than the one being graded.

The idea worth trying for v16, from the off-policy SFT literature: where the
model's own best-of-n fails the gate, do not fall back to the human original
and do not drop the document. Show the model the human original and ask it to
redo the rewrite in its own words, then re-gate that. It converts an
unusable off-policy target into an on-policy one, and it only costs a second
sampling pass on the documents best-of-n already lost.

### The training targets get shorter every generation

Median output-to-input length ratio of the kept pairs:

| dataset | n    | p10  | p50  | mean | under 0.6x |
| ------- | ---- | ---- | ---- | ---- | ---------- |
| v10     | 1488 | 0.68 | 0.99 | 0.94 |  6%        |
| v11     | 1295 | 0.65 | 0.96 | 0.93 |  7%        |
| v12     |  966 | 0.86 | 1.00 | 1.01 |  0%        |
| v14     |  975 | 0.56 | 0.81 | 0.81 | 13%        |
| v15     |  164 | 0.53 | 0.72 | 0.70 | 23%        |

This is a drift, not a one-off. Best-of-n ranks by findings removed, deleting
text removes findings, and the sources get dirtier each generation, so the
selection filter leans harder on shortening every time. Split by corpus, the
slop-sourced pairs sit at 0.72 on their own, so it is not an artefact of the
corruption pass inflating its inputs by 1.16x.

Deliberately NOT guarded yet. v14 trained at 0.81 and did not chop at
inference; the v7 chopping pathology came from a reward that paid all the way
to zero, which the band taper already fixed, not from short training targets.
Adding a length floor now would be an unmeasured guard. Train v15 as built,
then read the clean-document numbers in `clean-report` — over-deletion shows
up there as documents coming out dirtier and as a falling length ratio on
text that needed no work. Add the floor only if that number moves.

Selection on the first 200 sampled documents: 164 kept (82%), mean cut 22.5
per 1k. Of the 1600 samples, 568 were rejected for dropping facts, 57 for
cutting too little, 57 for barely changing the source, 0 degenerate.

## v15 measured: matched difficulty did not move it either

The stop rule was prose-dirty cut >= 28.0 at faithfulness >= 0.909.
**v15 cut 26.1 at faithfulness 0.908. FAIL.**

| prose dirty (n=87, 71 docs) | v15  | v14  | base 8B |
| --------------------------- | ---- | ---- | ------- |
| findings/1k 40.9 ->          | 14.8 | 15.1 | 14.9    |
| cut                         | 26.1 | 25.7 | 26.0    |
| landed in band              | 74%  | 71%  | 69%     |
| came out dirtier            |  1%  |  0%  |  0%     |
| faithfulness                | 0.908| 0.893| 0.909   |
| length ratio                | 0.738| 0.722| 0.716   |

The headline means cannot settle this, so `arm-diff.ts` compares the same
document under both arms and reports the paired difference. Both arms rewrite
the same source, so document-to-document variance cancels.

| slice, v15 minus base | paired cut     | v15 ahead on | verdict |
| --------------------- | -------------- | ------------ | ------- |
| prose dirty           | +2.19 +/-2.38  | 65%          | SAME    |
| prose clean           | -0.47 +/-1.22  | 49%          | SAME    |
| technical dirty       | -0.20 +/-2.56  | 42%          | SAME    |
| technical clean       | -0.69 +/-2.49  | 46%          | SAME    |

Every interval spans zero. v15 is the base model with extra steps. The one
real difference is length: +0.028 +/-0.015, so v15 deletes slightly LESS than
base. The shortening drift in the training targets did not become a
shortening model, which is the one thing that was worth watching. No length
floor is needed.

The regression to watch: prose-clean "came out dirtier" went 3% (base) to 9%
(v15). Small n, but it is the wrong direction on documents that needed no work.

### What four generations of this say

| version | the lever pulled                          | result vs base |
| ------- | ----------------------------------------- | -------------- |
| v11     | rewrite the instruction prompt            | inert          |
| v12     | delete the training data that taught copying | small gain  |
| v14     | self-distil from best-of-8                | same as base   |
| v15     | match the benchmark's difficulty and habits | same as base |

Every one of these is a data-side fix, and every one lands on the base model's
own behaviour. That is what rejection-sampling SFT does: best-of-n selects the
tail of the base model's OWN distribution, and training on that tail moves the
mean by a fraction of the gap. Measured headroom on the hard slice was 5.13;
v15 captured about 2.2 of it, and not significantly.

The target has to come from outside the base model's distribution. The
untried levers, cheapest first:

1. Measure a stronger model's ceiling on the SAME benchmark before buying
   anything. If a stronger teacher only cuts 27, teacher distillation has no
   headroom either and the reward metric is the thing that is saturated.
2. Teacher distillation: a stronger model writes the targets.
3. GRPO on-policy, which optimises the reward directly instead of imitating
   samples drawn from it.

## What a stronger writer can cut, and where

Four generations of data work landed on the same number, and the honest next
question was whether 27 weighted findings per 1k is simply all the metric will
pay for. So: benchmark documents written out as plain files, rewritten by hand
by a stronger model reading the same style guide the student trains under,
scored on the same metric, paired against the same documents.

The first twelve said +7.69 ±5.48, ahead on 75%. Eight more documents took it
to **+1.10 ±5.22, ahead on 45%** — no difference at all. Twelve documents was
never enough to state a result and it was stated anyway. Record that as a
lesson about this benchmark: at n=12 the interval is wider than any effect
worth chasing, and a paired mean over a small slice is one document family away
from reversing.

Per document, the split is not noise. It is composition.

| document family | paired teacher minus base 8B | ahead on |
| --- | --- | --- |
| blog prose | **+10.2** | 5 of 6 |
| GitHub PR descriptions | −2.8 | 5 of 14 |

The teacher is decisively better on writing meant for a human reader, and no
better on PR bodies. On those the base 8B already cuts 34 to 47 per 1k, and it
gets there partly by deleting: its length ratio on them runs 0.63 to 0.82
against the teacher's 0.85 to 0.93. The metric pays for deletion on dense
technical text, and the teacher will not delete.

Two things follow.

First, the `prose-dirty` slice is mostly GitHub PR descriptions. The domain
split keys on numbers and symbols per 100 words, and a PR body has few of
either, so it lands in prose. Every "prose" number in this file from before
this section is majority PR text, which is not what "prose" was meant to name.

Second, a benchmark ceiling is the wrong instrument for deciding v16 anyway.
The question that decides it is whether a teacher target beats the target
best-of-8 already produced ON THE SAME TRAINING DOCUMENT — and `v15-samples`
holds eight base samples for every one of those 1190 documents, so that
comparison costs nothing and is exactly on distribution.

### Why a teacher could still be the first real change

Every previous generation drew its targets from the base model's own
distribution — a prompt change, a data filter, best-of-8 over its own samples.
Rejection sampling selects the tail of a distribution; training on that tail
moves the mean by a fraction of the gap, which is exactly the +2.2 that keeps
showing up. A teacher target is not drawn from that distribution at all. That
remains the one thing v16 changes.

The gates stay identical. `teacher-collect.ts` writes the rewrites into the
shape `best-of-n.ts` already consumes, so faithfulness, echo, minimum cut, and
the benchmark near-duplicate check all apply to a teacher target exactly as
they apply to a sample. A teacher that drops a fact is thrown out like anything
else.

### The gate v16 has to clear before any GPU time

Teacher target minus base best-of-8 target, paired on the same training
documents, at least +3.0 with the interval clear of zero. If the teacher only
matches what best-of-8 already found, there is nothing to distil and the
answer is on-policy RL or a reward that stops paying for deletion.

## Teacher distillation is dead, and the reason is worth more than the result

The gate above was run the moment the first batches landed. It failed the
other way round.

| target, same 39 training documents | cut per 1k | faithfulness | length ratio |
| --- | --- | --- | --- |
| teacher | 16.4 | 0.996 | 0.880 |
| base 8B, best of 8 | **31.5** | 0.993 | 0.660 |
| base 8B, mean of 8 | 25.0 | | |

Paired: **−15.01 ±2.98, teacher ahead on 10%.** Faithfulness is level at 0.99
on both sides, so this is not the teacher being careless. The entire gap is
length. Best-of-8 removes 34% of the words. The teacher removes 12%.

The metric pays for compression, and a careful editor will not compress that
hard.

The obvious next thought was that best-of-8 wins by deleting, and that
faithfulness cannot see it because it counts anchors — numbers, symbols,
identifiers — which survive while a third of the argument goes. That thought
was tested and it is wrong. `content-loss.ts` scored best-of-8 at 53.4% of
source sentences dropped against the teacher's 9.2%, and reading the
worst-scoring document showed the measure, not the model, was at fault:

    source  "It is important to note that were we to encounter intelligent
             life elsewhere in the cosmos, there are certain facts we would
             inevitably have in common."
    output  "If we encountered intelligent life elsewhere in the universe, we
             would share some basic facts."

Scored 95% dropped. Nothing is dropped. Content-word overlap cannot separate
deleted from reworded, and it favours whichever rewrite stays closest to the
source wording — the teacher, by construction.

So the best-of-8 targets are not gutted documents. They are good rewrites. A
738-word corrupted essay becomes 381 clean words that carry the same argument.
That is what the reward is paying for, and it is right to pay for it.

Which makes the plateau harder to explain, not easier. The targets are good.
The student saw 963 of them. It did not move.

### Two instrument bugs, both mine, both worth remembering

The first version of `teacher-vs-bon` selected best-of-8 by raw cut, without
the faithfulness and echo gates `best-of-n` applies before it selects. That
compares a teacher against a target the dataset would never have contained,
and it flattered the teacher by making the base look unfaithful (0.885 against
its real 0.993).

And 39 of 78 subagent rewrites were copies of their input. That is a collection
failure, not a teacher judging a document finished, and scoring them measures
the collection process. They are counted and dropped.

### v15's adapter is real

Worth ruling out before concluding anything about training: 183 shared
benchmark documents, zero byte-identical outputs between `sft8bv15` and
`qwen8`, 27 above 0.9 word overlap. The adapter loads and changes the text. The
plateau is real training that lands nowhere, not a silent config failure.

### What v15 did with the headroom it was given

Selection headroom, best-of-8 minus mean-of-8, is **+6.42 ±1.28**. That is the
whole premise of self-distillation: the gap between what the model does and the
best of what it can do. v15 trained on the best-of-8 side of that gap and came
out at 26.1 against base's 26.0 — none of it. And it drifted the wrong way on
the one variable that carries the difference: its targets average 0.66 length
ratio, and v15 produces 0.738, longer than the 0.716 base it started from.

That is the sharpest statement of the plateau in this file. The model was shown
900 examples of aggressive compression and did not become more compressive.

## v15 never fit its own training data

Five generations of data work, and the explanation was never in the data.

`train-recall.ts` runs the student over 150 of the documents it trained on and
scores the target it was shown as a third arm. Held-out evaluation cannot
separate "learned it and cannot generalise" from "never learned it"; this can.

| on 150 documents v15 TRAINED on | cut per 1k | faithfulness | length ratio |
| --- | --- | --- | --- |
| the target it was shown | **28.4 ±1.4** | 0.991 | 0.673 |
| v15 | 23.8 ±1.5 | 0.927 | 0.708 |
| base 8B, untrained | 22.6 ±1.8 | 0.929 | 0.702 |

With the base arm beside it the size of the failure is plain. There were 5.8
findings per 1k available between the untrained model and the targets, on
documents the student trained on, and v15 moved 1.2 of them. It is 4.6 short on
text it memorised, and less faithful than its own targets on that text.

Faithfulness deserves its own line here. The targets sit at 0.991 and both
models sit at 0.928, trained and untrained alike. Training on targets that keep
99% of their anchors did not make the student keep more of its own. That is the
same underfitting showing up on a second axis, and it is worth re-checking
after v16 rather than assuming the reward's faithfulness term is at fault. So it is not a generalisation failure and it is not a data
failure. v15 is underfit: 963 examples, LoRA rank 32, 2 epochs at accumulation
8 is about 240 optimizer steps to teach a behaviour change, and it did not take.

Read the earlier sections of this file through that. The +6.42 selection
headroom is real and so is every measurement of it, but "v15 captured none of
it" was never evidence about rejection sampling — it is evidence that the run
which was supposed to capture it stopped before it had learned anything. The
same holds for v14. Both were graded on data they never absorbed.

### v16 changes the training and nothing else

Same 963 pairs, same prompt, same gates, same benchmark. Rank 64, 6 epochs,
accumulation 4 — four times the rank and six times the optimizer steps. The
data is held fixed deliberately: if this moves the model, then four generations
of dataset work were all measuring the same missing training, and that is worth
knowing before another corpus is built.

Recall is checked BEFORE the benchmark. If v16 still misses 28.4 on documents
it trained on, no held-out number is worth reading and the knobs move again.

### The stop rule for v16

First gate: at least 27.5 cut per 1k on the 150 training documents at
faithfulness 0.97 or better. Miss it and the training is still wrong, so do not
report a benchmark number.

Second gate: paired against base 8B on prose-dirty, at least +3.0 with the
interval clear of zero, at faithfulness no worse than 0.909.

## A third of what the product reports, the reward cannot see

The goal names both rulepacks, and `arm-diff` cannot answer whether both are
served: it reports one number in reward units, which folds all of `ai-style`
and exactly two `reader-first` rules together. `pack-diff.ts` splits the same
paired difference by pack and by rule, and counts every rule in both packs
including the ones the reward does not pay for.

v15 against base 8B, prose-dirty, 48 documents, unweighted findings per 1k:

| pack | in the source | v15 leaves | base leaves | paired diff |
| --- | --- | --- | --- | --- |
| ai-style | 52.5 | 34.5 | 33.9 | −0.59 ±2.86 SAME |
| reader-first | 27.3 | 10.2 | 11.6 | +1.46 ±1.67 SAME |

Both packs SAME, which is the same story as everywhere else. One rule is
BETTER: `reader-first/aside-pileup`, +0.62 ±0.61.

The number worth keeping is what sits at the top of the rule table:

| rule | in the source | paid? |
| --- | --- | --- |
| ai-style/passive-actor-hiding | 18.94 | **no** |
| reader-first/sentence-load | 14.74 | yes |
| ai-style/evidence-cluster | 12.27 | yes |
| reader-first/abstract-reference-chain | 4.45 | **no** |
| reader-first/aside-pileup | 4.23 | yes |

`passive-actor-hiding` alone is 36% of every ai-style finding in dirty
benchmark prose, and the reward is silent on it. Add the unpaid `reader-first`
rules and about a third of everything the product reports on this slice is
invisible to training.

That is not a bug. The exclusion is evidence-backed: measured on 400 paired
documents the rule fires HARDER on the human original than on the slop made
from it, −0.18 ±0.10, so paying to remove it teaches the model to write less
like a person. Both facts are true at once, and they define the shape of the
gap rather than a mistake to fix.

What it means for the goal is concrete. "Cleans bad writing better" can be
demonstrated on the paid rules and still leave the largest single habit in the
corpus untouched, and no summary in reward units would show it. Every claim
about v16 gets reported per pack, from this tool, with the unpaid rules visible.

## v16 fits the data. The diagnosis was right.

Same 963 pairs, same prompt, same gates, same benchmark. Only the training
changed: 6 epochs at accumulation 4 is 1446 optimizer steps against v15's 240.
Rank stayed at 32 — rank 64 all-linear OOMs at step 34 against a bf16 8B on a
24GB card with gradient checkpointing already on, and the 4-bit escape hatch
would train the adapter against different weights than the eval applies it to.

On the 150 documents the student trained on:

| arm | cut per 1k | faithfulness | length ratio |
| --- | --- | --- | --- |
| the target it was shown | 28.4 ±1.4 | 0.991 | 0.673 |
| **v16** | **28.0 ±1.5** | **0.990** | **0.674** |
| v15 | 23.8 ±1.5 | 0.927 | 0.708 |
| base 8B, untrained | 22.6 ±1.8 | 0.929 | 0.702 |

v16 matches its targets on all three axes. Gate was 27.5 at faithfulness 0.97.

The faithfulness column is the one to read twice. v15 sat at the untrained
model's 0.928 no matter what it was shown; six times the steps moved it to the
targets' 0.99. A model that has not fit its data does not fail uniformly — it
holds its prior behaviour on every axis at once, and every axis moves together
when it finally fits.

So five generations of dataset work were graded on runs that had not absorbed
the data. That does not make the dataset work wrong; the corpora, the gates,
and the difficulty matching are all still measured and still hold. It makes the
conclusions drawn FROM those runs unsafe, and they are now reopened:

- "v14 is the same as base" and "v15 is the same as base" measured training
  that stopped early, not data that did not help.
- "Rejection sampling can only reach the base model's own tail" is still true
  as a statement about where targets come from, and was never demonstrated by
  these runs.
- The +6.42 selection headroom is real and remains uncollected until a held-out
  number says otherwise.

Whether any of this reaches unseen documents is a separate question, and
fitting the training set is the weakest possible evidence for it. The benchmark
gate decides: paired against base 8B on prose-dirty, at least +3.0 with the
interval clear of zero, at faithfulness no worse than 0.909, reported per
rulepack.

### And none of it reaches unseen documents

| slice, v16 minus base 8B | paired cut | verdict |
| --- | --- | --- |
| prose-dirty | +1.45 ±2.79 | SAME |
| prose-clean | +1.05 ±1.25 | SAME |
| technical-dirty | +0.75 ±4.84 | SAME |
| technical-clean | +3.02 ±2.98 | BETTER |

The stop rule was +3.0 clear of zero on prose-dirty. It is +1.45, so v16 fails.

technical-clean is not a win. The mean clears its own interval by 0.04 across
four slices tested, which is what multiple comparisons produce, and `pack-diff`
on that slice shows both packs SAME — ai-style +3.91 ±4.14, reader-first +0.92
±1.34. A slice-level number that no rulepack underneath it can reproduce is a
coincidence, and reporting it as a result would be the fifth time this session
that a number was stated before its interval justified it.

Per pack on prose-dirty: ai-style +0.28 ±2.98 SAME, reader-first +1.14 ±2.07
SAME. Both packs, unmoved.

### What v16 is actually worth

Gate 1 and gate 2 disagree, and that is the first clean answer in six
generations. v16 reproduces its targets exactly on documents it trained on and
carries none of it to documents it did not. That is not underfitting, and it is
not the data being wrong. It is 963 examples memorised over 6 epochs.

Every previous generation confounded these two. v15 failed gate 1, so its gate
2 number never meant anything. v16 passes gate 1, so its gate 2 number means
something, and what it means is overfitting.

Which makes the next lever cheap and obvious, and it is the one this file
talked itself out of twice: more distinct documents, fewer passes over each.
The recipe demonstrably learns what it is shown now, so the question "can
rejection sampling exceed the base model's own tail" is finally testable —
it has been asserted here since v14 and was never once demonstrated by a run
that had fit its data.

Sampling more documents costs devbox time and nothing else.
