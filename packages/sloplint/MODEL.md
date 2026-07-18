# Sloplint parser model

This file is the operational model card for the parser shipped to Sloplint
users. Keep it current whenever training data, weights, export settings, URLs,
or acceptance thresholds change.

## Current release

- Model release: `compact-int8-v1`
- Architecture: BERT-Mini encoder with UPOS, biaffine dependency-arc, and
  selected-head dependency-relation heads
- Runtime artifacts: two opset-17 ONNX graphs
- Runtime: ONNX Runtime Node for the CLI; ONNX Runtime Web/WASM for the site
- Bundle size: approximately 16 MiB including tokenizer metadata
- User-facing download: `https://writinglint.nikhilv.workers.dev/model/*`
- CLI cache: `$XDG_CACHE_HOME/sloplint/models/compact-int8-v1`, falling back to
  `~/.cache/sloplint/models/compact-int8-v1`
- Integrity: the release manifest SHA-256 is pinned in the CLI; every ONNX and
  tokenizer artifact is checked against the byte count and SHA-256 recorded in
  that manifest before loading

Required files:

```text
manifest.json
parser.onnx
relations.onnx
tokenizer/tokenizer.json
```

The classifier used by the broader WritingLint score is intentionally not part
of Sloplint. Sloplint reports deterministic rule violations, not a probability
that a person or model wrote the document.

## How it was trained

The model began with a compact pretrained English encoder and was fine-tuned for
Universal Dependencies outputs: word-level UPOS, a syntactic head for every
word, and a dependency label for the selected head. Stanza was used offline as
a teacher/reference during experimentation; it is not shipped and is not a
runtime dependency.

The distinguishing training step is **rule-aware distillation**. In addition to
general dependency data, controlled construction families exercise structures
that affect WritingLint rules, including coordination, negation, clausal
attachments, passive agents, subjects, objects, modifiers, and complements. A
strict holdout keeps expanded lexical families entirely out of training so the
model must learn structure rather than memorize phrases.

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
high. Sloplint therefore uses the shared TypeScript constrained decoder, which
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

Training is Python-only and runs on the CUDA devbox; end users never need
Python. Use `devbox-local` when the `devbox` SSH alias is unavailable, and run
long jobs in tmux.

The pipeline entrypoints are under `training/parser/`:

1. Prepare the UD and rule-sensitivity datasets.
2. Train candidates with `train.py`.
3. Evaluate general UD metrics and strict downstream rule replay.
4. Export the selected checkpoint with `export_onnx.py`.
5. Prove PyTorch/ONNX parity.
6. Quantize with `quantize_onnx.py`.
7. Re-run strict rule replay, valid-tree checks, Node benchmarks, and browser
   smoke tests.
8. Upload all versioned artifacts to R2 with
   `scripts/upload-model-to-r2.sh`.
9. Bump the version and pinned manifest SHA-256 in Sloplint's `src/model.ts`,
   and update the browser parser together.

Never overwrite an existing model version in place. Publish a new immutable
version, validate it, then update clients. Keep the old R2 prefix available so
installed CLIs remain reproducible.

## Licensing and data boundaries

`nlpgraph` is company IP and is a hard clean-room boundary: no code, models,
weights, fixtures, or derived internal behavior may enter this pipeline. Stanza
is an offline reference only. Before a public model release, audit and record
the license of every UD treebank and pretrained component used by that exact
checkpoint. Do not assume that an earlier audit automatically covers new data.

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
- The public model host should move to a Sloplint-owned domain before the first
  independent product release.
