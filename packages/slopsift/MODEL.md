# SlopSift parser model

This file is the operational model card for the parser shipped to SlopSift
users. Keep it current whenever training data, weights, export settings, URLs,
or acceptance thresholds change.

## Current release

- Model release: `compact-int8-v1`
- Architecture: BERT-Mini encoder with UPOS, biaffine dependency-arc, and
  selected-head dependency-relation heads
- Runtime artifacts: two opset-17 ONNX graphs
- Runtime: ONNX Runtime Node for the CLI; ONNX Runtime Web/WASM for the site
- Bundle size: approximately 16 MiB including tokenizer metadata
- License boundary: trained ONNX graphs are CC BY-SA 4.0; BERT-derived
  tokenizer files retain Apache 2.0 lineage; runtime source code is MIT
- npm delivery: bundled once in `writinglint-parser-node/model`; WritingLint and
  SlopSift consume that dependency without duplicating the weights
- editor delivery: copied into Chrome and platform-specific VS Code artifacts
- browser demo delivery: `https://models.slopsift.dev/compact-int8-v1/*`, backed
  by the `slopsift-models` R2 bucket
- fallback cache: `$XDG_CACHE_HOME/slopsift/models/compact-int8-v1`, used only
  when a bundled or explicitly configured model is unavailable
- Integrity: the release manifest SHA-256 is pinned in the CLI; every ONNX and
  tokenizer artifact is checked against the byte count and SHA-256 recorded in
  that manifest before loading

Required files:

```text
manifest.json
parser.onnx
relations.onnx
tokenizer/tokenizer.json
tokenizer/tokenizer_config.json
```

The classifier used by the broader WritingLint score is intentionally not part
of SlopSift. SlopSift reports deterministic rule violations, not a probability
that a person or model wrote the document.

## How it was trained

The model began with a compact pretrained English encoder and was fine-tuned for
Universal Dependencies outputs: word-level UPOS, a syntactic head for every
word, and a dependency label for the selected head. Stanza was used offline as
a teacher/reference during experimentation; it is not shipped and is not a
runtime dependency.

The distinguishing training step combines structured distillation with
rule-sensitive supervision. In addition to general dependency data, controlled
construction families exercise structures that affect WritingLint rules,
including coordination, negation, clausal attachments, passive agents,
subjects, objects, modifiers, and complements. A strict holdout reserves
expanded template families for evaluation, reducing lexical-template leakage
and testing transfer to unseen variants. It does not by itself establish broad
generalization or prove the absence of lexical shortcuts.

The selected checkpoint used 50 canonical rule-sensitivity examples. On 299
strict family-heldout sentences (2,886 tokens), it raised critical-relation LAS
to 99.88 and downstream rule-decision F1 to 99.77. Adding examples through 80
did not improve the downstream metric, so the smaller checkpoint won.

The full experiment and data-generation methodology live in:

- `training/parser/RESEARCH.md`
- `experiments/rule-sensitivity/RESULTS.md`
- `experiments/rule-sensitivity/README.md`

## Decoding and correctness

Raw independent arc argmax can create cycles or multiple roots even when LAS is
high. SlopSift therefore uses the shared TypeScript constrained decoder, which
enforces exactly one root and repairs cycles using the minimum score loss. The
decoder and graph traversal have independent adversarial tests.

FP32 ONNX export was exactly aligned with PyTorch on the strict holdout: 100%
UPOS argmax, decoded-head, and relation argmax agreement, with no invalid trees.

## Quantization decision

Dynamic INT8 quantization reduced the graph bundle from 46.74 MiB to about 15
MiB. Against the FP32 reference it retained:

- 99.77 downstream rule F1
- 213 true positives, one false negative, zero false positives
- zero invalid dependency trees
- 99.58% exact token parity (2,874 / 2,886)
- 95.99% exact sentence parity (287 / 299)

Local macOS arm64 Node measurements:

| Metric | INT8 result |
| --- | ---: |
| Session creation | 109.1 ms |
| RSS increase | 50.1 MiB |
| Single-sentence p50 | 2.14 ms |
| Single-sentence p95 | 3.97 ms |
| Batched throughput | 21,871 tokens/s |

Product behavior, valid trees, and rule precision/recall are release gates.
Aggregate LAS and raw graph parity are diagnostics, not sufficient acceptance
criteria on their own.

## Reproducing a model release

Training is Python-only and can run on a CUDA machine; end users never need
Python. Run long jobs in a persistent terminal session.

The pipeline entrypoints are under `training/parser/`:

1. Prepare the UD and rule-sensitivity datasets.
2. Train candidates with `train.py`.
3. Evaluate general UD metrics and strict downstream rule replay.
4. Export the selected checkpoint with `export_onnx.py`.
5. Prove PyTorch/ONNX parity.
6. Quantize with `quantize_onnx.py`.
7. Re-run strict rule replay, valid-tree checks, Node benchmarks, and browser
   smoke tests.
8. Stage the npm package model with `npm run setup-model` and verify the
   `writinglint-parser-node` tarball.
9. Upload the immutable browser artifacts with
   `scripts/upload-slopsift-assets-to-r2.sh`.
10. Bump the version and pinned manifest SHA-256 in SlopSift's `src/model.ts`,
   and update the browser parser together.

Never overwrite an existing model version in place. Publish a new immutable
version, validate it, then update clients. Keep the old R2 prefix available so
installed CLIs remain reproducible.

## Licensing and data boundaries

Non-public parser implementations are a hard clean-room boundary: no code,
models, weights, fixtures, internal documentation, or derived internal behavior
may enter this pipeline. Stanza is an offline reference only.

For `compact-int8-v1`, UD English EWT is CC BY-SA 4.0, BERT-Mini is Apache 2.0,
and the DeBERTa training teacher is MIT. The distributed graphs therefore use
CC BY-SA 4.0 as a conservative compliance choice; the tokenizer retains its
Apache 2.0 lineage. The package ships the complete attribution and file-level
boundary in `writinglint-parser-node/MODEL_LICENSE.md`.

The original run did not record the exact EWT Git revision. Future dataset
downloads require a fixed tag or commit, and future manifests must record it.
Do not assume that this audit automatically covers new data or checkpoints.

Natural prose and third-party evaluation text must remain separated according
to their licenses. Closed evaluation corpora are not published with the model.

## Known limitations and next work

- English only.
- Sentences are capped at 256 encoder subwords.
- INT8 changes a small number of token-level parses even though the controlled
  downstream lint behavior is unchanged.
- Natural-document, code-comment, and Markdown-specific holdouts need to grow.
- Browser cold-start and warm-latency measurements should be tracked per release.
- Confidence calibration is not yet exposed to rules.
- Track npm, Chrome, VS Code, and R2 artifact parity for every model release.
