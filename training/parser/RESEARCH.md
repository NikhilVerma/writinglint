# Compact dependency parsing research plan

## What the literature says

### Biaffine parsing is the safe baseline

Deep biaffine graph parsing remains the best-established accuracy/efficiency
default. A Pareto comparison of parser families found biaffine parsing to be the
best-balanced choice; sequence-labelling parsers win when decoding speed is the
dominant constraint.

- Dozat and Manning, *Deep Biaffine Attention for Neural Dependency Parsing*.
- Anderson and Gómez-Rodríguez, 2021:
  https://aclanthology.org/2021.iwpt-1.12/

Second-order TreeCRF training can improve over locally normalized biaffine
training, especially with partial/noisy annotations, while retaining batched GPU
training. It is a teacher-quality experiment, not the first browser student.

- Zhang, Li, and Zhang, 2020:
  https://aclanthology.org/2020.acl-main.302/

### Dependency-parser distillation is proven

Direct teacher/student distillation of a biaffine parser retained accuracy
surprisingly well: a student with 20% of the original trainable parameters lost
about one UAS/LAS point on average and ran 2.3x faster on CPU.

- Anderson and Gómez-Rodríguez, 2020:
  https://aclanthology.org/2020.iwpt-1.2/

For encoder distillation, MiniLMv2's query/key/value relation distillation is a
strong task-agnostic method and does not require teacher and student to have the
same number of attention heads.

- Wang et al., *MiniLMv2*:
  https://arxiv.org/abs/2012.15828

### Auto-parsed data is useful even in modest quantities

Structure-aware pretraining on noisy, automatically parsed text followed by
gold-treebank fine-tuning improves graph parsers across teacher/model settings;
one study found gains with as few as 2,000 auto-parsed sentences.

- Tian, Song, and Xia, 2022:
  https://aclanthology.org/2022.coling-1.483/

This supports using Stanza and a stronger owned teacher to annotate prose that
resembles Better Write's actual input distribution.

### Hexatagging is the important alternative

Hexatagging reduces projective dependency parsing to parallel tag prediction
with exact linear-time/space decoding. The original work reports 96.4 LAS and
97.4 UAS on PTB and roughly 10x faster decoding than earlier state-of-the-art
models.

- Amini, Liu, and Cotterell, 2023:
  https://aclanthology.org/2023.acl-short.124/

Its constraints matter: it is naturally projective, requires tree/tag
linearization, and PTB results do not directly predict raw-text UD EWT results.
It should be evaluated beside biaffine parsing, not assumed superior.

## Proposed experiment ladder

### E0: reproducible supervised baseline

First result (12 epochs, UD English EWT, RTX 4090):

| Metric | EWT test |
| --- | ---: |
| UPOS | 97.09 |
| UAS, all tokens | 93.72 |
| LAS, all tokens | 91.72 |
| UAS, excluding punctuation | 93.78 |
| LAS, excluding punctuation | 91.55 |
| Root attachment | 95.47 |

The selected checkpoint is 57 MB before ONNX export or quantization. This is a
reproducible baseline, not yet a shipping model. One test sentence exceeded the
temporary 256-subword limit and was skipped. Every subsequent comparison must
use the same data loader, label vocabulary, seed, and evaluator.

- Encoder: `google/electra-small-discriminator` (Apache 2.0; 12 layers, hidden
  size 256, four attention heads, 30,522-token vocabulary).
- Heads: UPOS + first-order biaffine arcs + biaffine relations.
- Data: English EWT only until licensing is reviewed.
- Report: punctuation-excluded and all-token UPOS/UAS/LAS, roots, per-relation
  metrics, checkpoint bytes, peak VRAM, and sentences/second.

### E1: encoder Pareto comparison

Completed controlled comparison (12 epochs, same EWT data, parser heads, seed,
and evaluator):

| Encoder | Layers / hidden | Test UAS | Test LAS | FP32 checkpoint | CPU full-test time* |
| --- | ---: | ---: | ---: | ---: | ---: |
| ELECTRA-small discriminator | 12 / 256 | 93.78 | 91.55 | 57 MB | 12.35 s |
| MiniLM-L6-H384 | 6 / 384 | 92.98 | 90.55 | 92 MB | 10.74 s |
| BERT-Mini | 4 / 256 | 90.52 | 87.68 | 47 MB | 6.60 s |

\*PyTorch CPU process startup, model loading, tokenization, and evaluation of the
same EWT test split on the training host; this is directional, not the eventual ONNX
microbenchmark.

MiniLM is dominated: only 13% faster than ELECTRA in this measurement, 61%
larger, and one LAS point worse. ELECTRA is the compact quality baseline.
BERT-Mini is the useful aggressive student: it roughly halves CPU time but loses
3.87 LAS points, making it the first target for structured distillation.

Hold the parser heads and training schedule constant:

1. ELECTRA-small.
2. MiniLM-L6-H384.
3. Six-layer ELECTRA student initialized from alternating teacher layers.
4. A 50–80M quality model used as a teacher-assistant candidate.

Compare FP32 and INT8 bytes/CPU latency, not only parameter counts.

### E2: strong accessible teacher

Completed first teacher: `microsoft/deberta-v3-base` (MIT), eight epochs on the
same EWT splits. It reached 95.56 UAS / 93.61 LAS on test excluding punctuation,
with 98.02 UPOS and a 708 MB FP32 checkpoint. That is +2.06 LAS over
ELECTRA-small and +5.93 LAS over BERT-Mini, providing a meaningful distillation
gap. The teacher is a training artifact only and will never ship to users.

Train a larger pretrained encoder with the same owned label space and parser
heads. Compare local cross-entropy against first-order/second-order TreeCRF
training. Retain full arc, relation, and UPOS distributions for distillation.

Stanza remains an independent second teacher and domain oracle. Agreement
between independently trained teachers is a useful confidence signal.

### E3: task-specific structured distillation

First completed E3 run distils DeBERTa-v3-base into BERT-Mini using a 50/50
mixture of gold losses and temperature-2 KL over UPOS, full arc distributions,
and relation distributions on gold heads. Test LAS increased from 87.68 to
88.13 (+0.45) at the same 47 MB FP32 size; UAS increased from 90.52 to 90.92.
This validates structured KD but leaves substantial teacher capacity uncaptured.

We also tested fixed square-root score scaling with half-width parser heads
(arc 128, relation 64), inspired by recent normalized-biaffine work. It reduced
the checkpoint to 44 MB but fell to 87.37 LAS. Fixed scaling is rejected for
this architecture. Follow-ups should test projection LayerNorm or a learnable
temperature independently from head-width reduction.

Train the student with a weighted combination of:

- gold UPOS/arc/relation cross-entropy;
- temperature-scaled KL over candidate-head distributions;
- relation-distribution KL on gold and teacher-selected heads;
- UPOS-distribution KL;
- projected hidden-state or MiniLMv2-style attention-relation loss;
- sentence-level tree confidence and teacher-agreement weighting.

Run ablations. Distillation terms are not accepted merely because they are
fashionable; each must improve the accuracy/size/latency frontier.

### E4: domain adaptation

Create an auditable prose corpus with distribution rights, then:

1. annotate it with Stanza and the owned large teacher;
2. retain high-confidence agreements;
3. oversample constructions and relations important to Better Write;
4. structure-pretrain on pseudo trees;
5. finish on gold UD data to prevent teacher-error drift.

### E5: hexatagging

Train a hexatag head on the same encoder and splits. Measure:

- projectivization loss on EWT;
- invalid sequence rate;
- exact decoding latency;
- UAS/LAS and critical-relation recall;
- ONNX graph/operator simplicity.

If both heads are cheap, evaluate a shared-encoder dual-head model.

### E6: ONNX runtime export

The selected 50-sentence rule-aware BERT-Mini checkpoint now exports as two
opset-17 graphs: a 45,615,489-byte parser graph and a 3,398,596-byte selected-head
relation graph (46.74 MiB combined before quantization), plus a 711 KB tokenizer.
The split avoids rerunning the encoder and avoids materializing relation scores
for every possible head.

On all 299 strict family-heldout sentences (2,886 tokens), ONNX Runtime CPU and
PyTorch achieved 100% UPOS argmax, decoded-head, and relation argmax agreement.
Maximum absolute logit differences were 1.53e-5 for UPOS, 1.07e-4 for arcs, and
4.20e-5 for selected-head relations. All decoded outputs were valid trees. The
ONNX-only predictions were byte-identical to the PyTorch prediction JSONL and
produced the same 99.77 rule F1 in the TypeScript lint replay.

Measured batched CPU graph execution on the training host was approximately 0.7-0.8 ms
per controlled sentence. This excludes tokenization, host decoding, session
creation, and file loading, so it is a graph-throughput result rather than a
product latency claim. Next measure cold start and single-document latency in
`onnxruntime-node` and `onnxruntime-web`, then quantize.

The first full Node integration was also benchmarked locally on macOS arm64 with
Node 24.10.0. Across the 299-sentence strict holdout it achieved 100% exact
sentence and token parity with the Python reference, including token forms,
UTF-16 offsets, UPOS, heads, and relations. Session creation took approximately
126 ms and increased RSS by 115 MiB. Sequential single-sentence parsing measured
3.14 ms p50 and 6.48 ms p95. A batched 100-sentence/972-token document averaged
87.3 ms, or roughly 11.1k tokens/second. These measurements include TypeScript
tokenization and decoding plus both ONNX graph calls, but not process startup or
reading model files before session creation.

### E7: INT8 deployment artifact

Dynamic INT8 quantization reduced the two ONNX graphs from 46.74 MiB to roughly
15 MiB, with the tokenizer and classifier bringing the complete parser bundle to
approximately 16 MiB. On the strict rule replay, the quantized model retained
99.77 F1 (213 true positives, one false negative, and no false positives) and
produced no invalid trees.

On the local macOS arm64 Node benchmark, INT8 session creation took 109 ms and
increased RSS by 50 MiB. Exact token parity with the FP32 reference was 99.58%
(2,874 / 2,886); exact sentence parity was 95.99% (287 / 299). Sequential parsing
measured 2.14 ms p50 and 3.97 ms p95, while a 972-token batch reached roughly
21.9k tokens/second. The downstream lint decisions on the controlled replay were
unchanged, which is the product acceptance metric that matters most here.

The same INT8 graphs, tokenizer, classifier, and TypeScript decoder now run in a
browser Web Worker through ONNX Runtime Web/WASM. The production Cloudflare
Worker serves the static site and streams versioned model/runtime artifacts from
R2, so inference remains entirely on-device and requires no Python service.

## Candidate innovations

### Rule-aware distillation

The initial controlled learning curve and a stricter family-held-out replication
are complete. On 299 sentences from wholly unseen expanded construction
families, 50 canonical training sentences raised critical LAS from 96.89 to
99.88 and direct rule-decision F1 from 98.34 to 99.77 while improving EWT test
LAS from 88.13 to 88.50. Increasing to 80 examples did not improve the downstream
metric. See `experiments/rule-sensitivity/RESULTS.md`. The next benchmark should
add natural prose and negative controls rather than more lexical variants.

The strict test also exposed a cyclic greedy-head prediction, despite aggregate
LAS above 98%. A deterministic single-root plus minimum-loss cycle-repair
decoder is now implemented in Python and TypeScript. It eliminated invalid trees
and raised the 25-example rule F1 from 99.53 to 99.77; the baseline improved from
98.34 to 99.29. Recursive subtree traversal is independently cycle-safe. Exact
Chu-Liu/Edmonds is now an optional Pareto experiment rather than a correctness
prerequisite; compare its latency and rule-level result before adopting it.

Generic LAS weights every arc equally, while Better Write depends heavily on
coordination and clausal structure. Add a product metric and optional training
weight for `conj`, `cc`, `advcl`, `acl`, `nsubj`, `obj`, `amod`, `advmod`, `cop`,
`ccomp`, `xcomp`, `obl`, `case`, and `appos`. Preserve an unweighted run so gains
cannot conceal broad parser regressions.

### Dual-view confidence

Use biaffine and hexatag predictions as two structurally different views over a
shared encoder. Agreement supplies a calibrated confidence feature; disagreement
can suppress fragile lints or trigger a slower repair decoder. This may improve
product precision for little model-size cost.

### Construction-focused consistency training

Generate meaning-preserving surface perturbations of known constructions and
penalize dependency changes on the rule-critical arcs. Examples include synonym
replacement, modifier insertion, punctuation variation, and clause movement.
The goal is not to teach lint labels to the parser, but to make the underlying
syntax stable under edits that currently defeat brittle parsers.

### Distil distributions, not only Stanza's final tree

Hard pseudo trees discard ambiguity. The owned large teacher should expose arc
and relation distributions. Stanza can contribute independent hard labels and
agreement filtering, while the accessible teacher provides the soft targets.

## Licensing boundary

- `google/electra-small-discriminator`: Apache 2.0 model card:
  https://huggingface.co/google/electra-small-discriminator
- UD English EWT: CC BY-SA 4.0:
  https://universaldependencies.org/treebanks/en_ewt/
- UD English GUM: CC BY-NC-SA 4.0 and excluded from commercial training:
  https://universaldependencies.org/treebanks/en_gum/
- UD explicitly warns that treebank licenses differ:
  https://universaldependencies.org/contributing/licensing.html

For `compact-int8-v1`, distribute the trained graphs under CC BY-SA 4.0 as a
conservative compliance choice. The BERT-derived tokenizer retains its Apache
2.0 lineage. The original training run did not record the exact EWT Git
revision; future downloads require a fixed tag or commit and future manifests
must keep dataset, annotation, teacher, and checkpoint provenance
machine-readable.
