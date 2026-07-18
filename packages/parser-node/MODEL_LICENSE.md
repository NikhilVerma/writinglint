# Bundled parser model: license and attribution

This notice applies to the `compact-int8-v1` model bundled under `model/` in
`writinglint-parser-node` and served from the matching immutable SlopSift R2
path. It does not change the MIT license for WritingLint's source code.

## Trained ONNX graphs

`model/parser.onnx` and `model/relations.onnx` are distributed under the
[Creative Commons Attribution-ShareAlike 4.0 International
license](https://creativecommons.org/licenses/by-sa/4.0/) (`CC BY-SA 4.0`).

We use CC BY-SA 4.0 for these trained graphs as a conservative compliance
choice because their gold dependency supervision includes
[Universal Dependencies English EWT](https://universaldependencies.org/treebanks/en_ewt/),
which is published under CC BY-SA 4.0.

Attribution for UD English EWT belongs to its contributors, including Natalia
Silveira, Timothy Dozat, Sebastian Schuster, Miriam Connor, Marie-Catherine de
Marneffe, Nathan Schneider, Ethan Chi, Samuel Bowman, Christopher Manning,
Hanzhi Zhu, Daniel Galbraith, and John Bauer. The canonical source and current
contributor list are maintained by the
[UD English EWT project](https://github.com/UniversalDependencies/UD_English-EWT).

WritingLint's modifications include training dependency-parser heads, teacher
distillation, rule-aware fine-tuning, constrained decoding integration, ONNX
export, and dynamic INT8 quantization. Copyright in those project-authored
modifications is held by Nikhil Verma and WritingLint contributors, 2026.

## Encoder and tokenizer lineage

The parser was initialized from
[`google/bert_uncased_L-4_H-256_A-4`](https://huggingface.co/google/bert_uncased_L-4_H-256_A-4),
published under the Apache License 2.0. Files under `model/tokenizer/` retain
that Apache 2.0 lineage. The Apache License 2.0 is available from the
[Apache Software Foundation](https://www.apache.org/licenses/LICENSE-2.0).

[`microsoft/deberta-v3-base`](https://huggingface.co/microsoft/deberta-v3-base),
published under MIT, was used as a training teacher but is not shipped.
[Stanza](https://github.com/stanfordnlp/stanza) was an independent offline
reference and is not shipped or called at runtime.

## Data and provenance boundary

The EWT source text and treebank files are not redistributed in this package.
The rule-sensitivity additions are project-authored synthetic constructions.
No private parser code, weights, fixtures, or documentation were used.

The exact EWT Git revision used for `compact-int8-v1` was not recorded by the
original training run. The dataset identity and license are known, but that
missing revision is a provenance limitation of this release. The downloader
now requires an explicit tag or commit so future model manifests can record an
exact source revision.
