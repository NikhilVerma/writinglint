# Adapter training (TODO Phase 4)

Every step here is deterministic and re-runnable. Nothing is throwaway: the
export is seeded, the manifest records hashes, and the Modal run is
parameterized and writes to a persistent volume.

## 1. Export the dataset

```bash
cd training/simplify
npx tsx src/cli/export.ts --trial trial-001
```

Reads `accepted.jsonl`, the human keeps from `human-verdicts.jsonl`, the
rejudge accepts, and the refix accepts. Applies the degenerate and
code-dump screens, strips emoji, prefixes every user turn with
`Simplify this:`, and splits ~20% of prompt families into an eval-only
holdout (seeded, family-atomic). Writes `runs/trial-001/export/`:
`train.jsonl`, `holdout.jsonl`, and `manifest.json` with content hashes.
Re-running with the same inputs reproduces byte-identical files.

## 2. Train the LoRA adapter on Modal

```bash
modal run training/simplify/train/train_lora.py
# hyperparameters, base model, and run name:
modal run training/simplify/train/train_lora.py --epochs 6 --lr 5e-5
modal run training/simplify/train/train_lora.py \
  --base-model Qwen/Qwen3-4B --run-name qwen3-4b-lora-v1
```

Loss is computed on the completion (the rewrite) only. Training on the
full sequence teaches the model to copy the input document; the v1 adapter
had that bug.

Base model `Qwen/Qwen3-1.7B` (TODO model plan), LoRA r=16 on all linear
layers, bf16 on an L4, seed 42. The holdout is eval-only. Checkpoints and
the final adapter land in the Modal volume `slopsift-simplify-lora` under
the run name (default `qwen3-1p7b-lora-v1`). Re-running overwrites that run
name; pass `run_name` in the function call for a fresh run.

## 3. Fetch the adapter

```bash
modal volume get slopsift-simplify-lora qwen3-1p7b-lora-v1/final ./adapter
```

## 4. Evaluate on the holdout

Generate rewrites for the 16 held-out prompts (base model, then adapter):

```bash
modal run training/simplify/train/generate.py --label base
modal run training/simplify/train/generate.py --label adapter \
  --adapter qwen3-1p7b-lora-v1/final
```

Outputs land in `runs/trial-001/eval/gen-<label>.jsonl`. Score all arms —
slopsift lint plus the 3-judge meaning panel — with:

```bash
cd training/simplify
npx tsx src/cli/evaluate.ts --trial trial-001 \
  --gen base=runs/trial-001/eval/gen-base.jsonl \
  --gen adapter=runs/trial-001/eval/gen-adapter.jsonl
```

Add `--lint-only` to skip the judge panel (free). The `original` and
`pipeline` arms come from `holdout.jsonl` automatically. Results append to
`runs/trial-001/eval/results.jsonl` keyed by (arm, source), so re-running
resumes without re-billing judges; `summary.json` holds the per-arm table.

## Provenance

- Dataset: `runs/trial-001/export/manifest.json` (counts, screens, holdout
  families, SHA-256 of both files, SFT prompt version).
- The system prompt is `prompts/rewrite-sft-v2.md`, versioned like every
  other prompt in the pipeline.
- Corpora stay gitignored; only code and prompts are committed.
