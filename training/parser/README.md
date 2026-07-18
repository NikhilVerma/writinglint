# Compact dependency-parser training

This package trains the parser that will replace the temporary Stanza runtime.
Python is used only for data preparation, training, evaluation, and ONNX export;
the shipped model will run through ONNX Runtime in TypeScript.

## First experiment

The baseline uses a compact pretrained encoder with three jointly trained heads:

- UPOS classification;
- biaffine dependency-arc prediction;
- biaffine dependency-relation prediction.

Run the same experiment with `google/electra-small-discriminator` and a compact
MiniLM checkpoint. Compare model bytes and CPU latency as well as UAS/LAS.

Checkpoint selection uses development LAS excluding punctuation.

```bash
python download_ud.py --treebank ewt --revision <exact-tag-or-commit>
python train.py \
  --data-dir data/UD_English-EWT \
  --encoder google/electra-small-discriminator \
  --output artifacts/electra-small-ewt
```

Re-evaluate a saved checkpoint with all-token and conventional
punctuation-excluded attachment scores:

```bash
python evaluate_checkpoint.py \
  --data-dir data/UD_English-EWT \
  --checkpoint artifacts/electra-small-ewt
```

## Data licensing

Every treebank must be explicitly allowlisted in `download_ud.py` with its
license and upstream URL.

- English EWT: CC BY-SA 4.0. Distributed WritingLint graphs trained with EWT
  use CC BY-SA 4.0 as a conservative compliance choice.
- English GUM: CC BY-NC-SA 4.0. It is intentionally excluded from commercial
  model training.

Do not silently combine all English UD treebanks.

The `compact-int8-v1` run predates the required revision argument and did not
record its exact EWT Git revision. Keep that limitation in its model notice;
all future releases must pin and record the precise input revision.

## Evaluation order

1. Gold EWT development/test UAS, LAS, UPOS, root accuracy, and per-relation
   metrics.
2. Stanza parity on Better Write construction fixtures.
3. Rule-level precision and recall.
4. ONNX parity, INT8 accuracy, bytes, cold start, and warm CPU/WASM latency.
5. Distillation and pseudo-labelled prose only after the supervised baseline is
   reproducible.

## Structured distillation

The distillation trainer encodes every sentence independently with the student
and teacher tokenizers, then aligns their outputs at the original word level.
It transfers UPOS, complete head distributions, and gold-head relation
distributions while retaining supervised UD losses:

```bash
python train_distill.py \
  --data-dir data/UD_English-EWT \
  --teacher artifacts/deberta-v3-base-ewt \
  --output artifacts/bert-mini-distilled-ewt
```

## ONNX export

The runtime is split into two graphs. `parser.onnx` runs the encoder and emits
UPOS, arc scores, and compact relation projections. After the host decodes a
valid tree, `relations.onnx` scores labels only for the selected heads. This
avoids both a second encoder pass and a large words-by-heads-by-relations output.

```bash
python export_onnx.py \
  --checkpoint artifacts/rule-family-50 \
  --output artifacts/rule-family-50-onnx \
  --validation-data rule-sensitivity/family-heldout.conllu

python predict_onnx.py \
  --model artifacts/rule-family-50-onnx \
  --data-file rule-sensitivity/family-heldout.conllu \
  --output artifacts/rule-family-50-onnx/holdout.jsonl
```

The exporter bundles tokenizer files, records SHA-256 hashes, checks both ONNX
graphs, and measures raw-logit plus UPOS/head/relation parity against PyTorch.
`predict_onnx.py` is an ONNX-only end-to-end regression path.
