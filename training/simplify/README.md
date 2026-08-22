# Simplification dataset pipeline

Turns genuine AI-generated prose into audited rewrite pairs for the
`WritingAssistant` fine-tuning trial (see the "Simplification dataset trial"
section of the repository TODO).

## How it works

1. **Generate** (`src/cli/generate.ts`): naturalistic prompts go to a diverse
   set of OpenRouter models as bare chat calls — no system prompt, no style
   instructions, no mention of linting — so the sources carry each model's real
   habits. Prose lands in `sources/source-<id>.md` with a provenance sidecar.
2. **Fix** (`src/cli/fix.ts`): for each source, an isolated headless coding
   harness (`claude -p` in a work directory that contains only `draft.md`)
   runs the globally installed `slopsift` and rewrites until the `ai-style`
   and `reader-first` packs report no errors or warnings.
3. **Judge**: two independent OpenRouter models from different providers
   compare original and rewrite using strict JSON-schema responses
   (`schemas/judge-response.schema.json`). Both pass → `accepted.jsonl`.
   Split verdict → `human-review.jsonl`. Both fail → the fixer retries with
   the judges' findings, up to `attemptLimit` fixer runs, then `rejected.jsonl`
   (meaning lost) or `unresolved.jsonl` (lint never came clean).

Raw judge responses are kept verbatim in `attempts.jsonl` for analysis.

## Durability and cost

Both phases are durably workflows (`@nikhilverma/durably`, state in
`.durably/`): kill a run and re-run the same command, completed API calls and
fixer runs return from the log and are never re-billed. Every OpenRouter call
is appended to `runs/cost-ledger.jsonl` (deduplicated by request id) and the
global `capUsd` in `config.json` hard-stops new calls. Fixer harness cost is
billed to the Claude subscription and recorded per attempt, outside the cap.

## Commands

```bash
# smoke test (no network): fake LLM + fake fixer, crash/resume covered
npx tsx --test training/simplify/test/pipeline.test.ts

# generate N sources (resumable; already-written sources are skipped)
npx tsx training/simplify/src/cli/generate.ts --count 4 --batch batch-001

# run the fix loop for everything not yet settled in a trial (resumable)
npx tsx training/simplify/src/cli/fix.ts --trial trial-001 [--limit 4]
```

## Train, serve, publish

`train/` holds the Modal jobs. Training checkpoints every 100 steps and commits
each one to the `slopsift-simplify-lora` volume, so a preempted worker resumes
from the last checkpoint instead of starting over. Launch with `--detach` so
the run survives losing the laptop connection.

```bash
# train a LoRA adapter on an exported dataset
SIMPLIFY_EXPORT_DIR=$PWD/runs/human-pairs-export SIMPLIFY_GPU=A100 \
  modal run --detach train/train_lora.py \
  --base-model Qwen/Qwen3-4B --run-name qwen3-4b-lora-v2-hp --epochs 2

# score it against the holdout arms
modal run --detach train/generate.py --label 4b-v2-hp \
  --adapter qwen3-4b-lora-v2-hp/final --base-model Qwen/Qwen3-4B
npx tsx src/cli/evaluate.ts --trial trial-001 \
  --gen 4b-v2-hp=runs/trial-001/eval/gen-4b-v2-hp.jsonl

# fold the adapter into the base weights, then serve them
modal run train/merge_adapter.py --run-name qwen3-4b-lora-v2-hp
modal secret create slopsift-simplify-key VLLM_API_KEY=<token>
modal deploy train/serve.py
```

`modal deploy` prints the endpoint URL. Open `playground/index.html` in a
browser to chat with the model, or push a folder of drafts through it:

```bash
SIMPLIFY_ENDPOINT=<url> SIMPLIFY_API_KEY=<token> \
  npx tsx src/cli/simplify-run.ts --in ./drafts
```

Both surfaces report the length ratio against the 0.7–1.3 band the training
rubric enforced, so a summarized or padded answer is visible at a glance.
`train/push_to_hub.py` uploads the merged weights and `train/MODEL_CARD.md` to
the Hugging Face Hub; it uploads weights and the card only, never corpus text.

## Reinforcement learning on the lint score

**See [FIXED-POINT.md](FIXED-POINT.md) first.** It carries the measured
evidence behind the current reward, the known defects, and the reason the
stage-2 GRPO run is on hold.

Supervised fine-tuning can only reward the target it is shown. That is why the
v2 adapter returned its input verbatim on documents unlike its training set:
the copy satisfies every rule SFT taught it — same facts, same order, same
length — and the model had no way to reword dense technical prose. Measured on
one pull-request description, Qwen3-4B echoed 95% of the input before any
fine-tuning at all, so the copying starts in the base model and the fine-tune
deepens it. Qwen3-8B echoed 51-54% and Qwen3-32B 23-31% on the same text.

GRPO scores whole rollouts against a reward instead, so copying can be made
worthless directly. `src/lib/reward.ts` combines four measurements:

| part | what it measures | role |
| --- | --- | --- |
| faithfulness | anchors (numbers, code spans, identifiers, links) kept, minus invented ones | gate |
| echo | share of the output's 4-grams lifted from the input | gate |
| lint | slopsift findings removed relative to the source | term |
| length | output-to-input word ratio inside the configured band | term |

Faithfulness and echo gate the reward rather than adding to it. As ordinary
terms either one can be bought: a verbatim copy is perfectly faithful and
perfectly sized, and a confabulation lints perfectly clean. As gates, a rewrite
earns credit for removing findings only while it stays true and stays out of
copy territory. Around 0.3 echo is the floor on identifier-dense text, because
a faithful rewrite keeps names and numbers in place — demanding zero would pay
the model to drop facts.

The faithfulness gate matters most. Breaking the copy habit pushes a small
model toward inventing facts instead, which is the harder failure to see. At
temperature 1.2 the 4B adapter dropped from 100% echo to 38%, and turned
"API offline 4146 pass" into "The API is offline at this time".

Weights and thresholds live under `reward` in `config.json`, so a run can be
re-weighted without a code change.

```bash
# build the prompt set (GRPO needs prompts and sources, not targets)
npx tsx src/cli/grpo-prompts.ts --from runs/human-pairs-export/train.jsonl

# check the reward against real rollouts before spending GPU time
npx tsx src/cli/score.ts < rollouts.jsonl   # {id, input, output} per line

# train
SIMPLIFY_GRPO_GPU=H100 SIMPLIFY_GRPO_TIMEOUT_S=43200 \
  modal run --detach train/train_grpo.py \
  --base-model Qwen/Qwen3-8B --run-name qwen3-8b-grpo-v1 --steps 500 --num-generations 8
```

The trainer shells out to `src/cli/score.ts` once per step rather than
reimplementing the rules in Python, so slopsift stays the single source of lint
truth and the eval harness cannot drift from the reward. Node 22+ strips types
natively, so the Modal image needs Node and slopsift but no build step.

The prompt distribution decides whether the echo gate ever fires. Measured in
anchors (numbers, identifiers, links) per 100 words, the pull-request text that
provoked 95% echo scores 7.9, while the essay corpus has a median of 1.4 and
only 0.8% of it reaches 8. Training on essays alone would tune length and
faithfulness and never meet the copying it exists to punish: across 64 rollouts
on essay prompts the echo term averaged 0.998.

`fetch-tech-docs.ts` pulls real merged pull-request descriptions and release
notes from large public repositories, strips template scaffolding and bot
comments, and keeps documents of 120-900 words at 3 or more anchors per 100
words. Twelve repositories yield about 1,050 documents at a median of 9.2
anchors per 100 words. On that corpus Qwen3-8B echoes a median 35% of its input
against 8% on essays, and its anchor kept-rate falls as low as 40%, so both
gates carry signal.

```bash
npx tsx src/cli/fetch-tech-docs.ts --per-repo 250
npx tsx src/cli/grpo-prompts.ts --from runs/human-pairs-export/train.jsonl \
  --docs runs/docs-technical --min-words 120 --max-words 900
```

Cap the prompt length so a faithful rewrite fits inside `max_completion_length`.
At 900 words the clipped ratio stays near zero; at 2,200 most rewrites hit the
2,048-token limit, and `mask_truncated_completions` then throws them away.

`src/cli/evaluate.ts` reports `echo`, `kept`, and `invented` per arm alongside
the lint numbers, so a run that trades copying for confabulation shows up in
the summary instead of passing quietly.

## Data policy

`sources/`, `runs/`, and `.durably/` are gitignored: generated corpora must
stay out of the repository and out of ordinary agent context (see the
evaluation rules in the TODO). Accepted records are unreviewed candidates
until the seeded human-review sample is done. Prompts and prompt versions are
committed; source text is reproducible from the sidecar metadata (model,
prompt, seed) but never committed.
