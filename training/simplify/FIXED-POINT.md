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
