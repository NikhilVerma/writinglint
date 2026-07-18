# Rule-aware parser learning curve

## Setup

- Base student: BERT-Mini, four layers / hidden size 256.
- Teacher: fine-tuned DeBERTa-v3-base dependency parser.
- Common training: UD English EWT gold supervision plus structured UPOS, arc,
  and relation distillation.
- Rule-aware addition: Stanza-labelled controlled sentences, repeated ten times,
  with token loss weight 4 for tokens whose counterfactual intervention changed
  a lint decision and 1 otherwise.
- Fixed held-out set: 80 sensitivity sentences, 755 tokens, including 247
  rule-critical tokens.
- Sizes: nested SHA-256-ranked subsets of 50, 100, and 250 sentences.
- Seed: 13. Checkpoints selected by EWT development LAS excluding punctuation.

## Results

| Rule-aware sentences | EWT test UAS | EWT test LAS | Held-out critical UAS | Held-out critical LAS |
| ---: | ---: | ---: | ---: | ---: |
| 0 (structured-KD baseline) | 90.92 | 88.13 | 99.19 | 98.79 |
| 50 | 90.86 | 88.14 | 100.00 | 100.00 |
| 100 | 90.85 | 87.98 | 100.00 | 100.00 |
| 250 | 91.02 | 88.33 | 100.00 | 100.00 |

The experiment validates that causal token weighting is learnable: 50 sentences
closed the 1.21-point critical-LAS gap without reducing general EWT LAS. The
250-sentence run also improved EWT LAS by 0.20 over the baseline.

## Limitations

This is a pipeline and signal-validation result, not evidence of broad
generalization. The held-out split hashes complete sentences, but related
lexicalized templates can occur in both train and test. Baseline critical LAS
was already 98.79, so the set has a strong ceiling effect. The next evaluation
must hold out entire transformation/template families and add natural prose,
parser-disagreement cases, and direct rule-decision accuracy from predicted
parses.

## Decision

- Keep rule-aware weighting in the research branch.
- Use 50 examples per genuinely distinct construction as the initial collection
  target; adding lexical variants beyond that is lower priority.
- Do not claim a state-of-the-art gain from this controlled split.
- Build a harder family-held-out benchmark before increasing synthetic volume.

## Strict family-held-out replication

The follow-up split holds out all 299 sentences from 12 expanded construction
families and trains only on nested subsets of 87 canonical-family sentences.
It therefore prevents the same lexicalized template construction from appearing
in training and evaluation. The remaining setup, seed, teacher, tenfold replay,
and EWT development-checkpoint selection are unchanged.

| Canonical sentences | EWT test LAS | Held-out LAS | Critical LAS | Rule F1 | Exact sentence agreement | Invalid trees |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 88.13 | 97.44 | 96.89 | 98.34 | 97.66 | 0 |
| 25 | 88.32 | 98.61 | 99.40 | 99.53 | 99.33 | 1 |
| 50 | 88.50 | 98.48 | 99.88 | **99.77** | **99.67** | 0 |
| 80 | 88.46 | **99.03** | 99.52 | 99.53 | 99.33 | 0 |

Rule F1 replays ten graph-dependent WritingLint rules over each predicted parse
and compares their sentence-level decisions with those from the reference parse.
All four runs had 100% rule precision. Recall rose from 96.73% at baseline to
99.53% with 50 sentences: six of the seven baseline misses were recovered. The
remaining miss is `false-agency`.

The 25-sentence greedy decoder produced one cyclic dependency assignment on
“Trust evidence, not instinct.” The evaluator counts that malformed tree as a
failed prediction. This is a product-critical finding hidden by high LAS:
shipping inference must enforce a single-rooted acyclic tree rather than expose
independent head argmaxes to recursive graph rules.

### Strict-test decision

- Use the 50-sentence checkpoint as the current rule-aware candidate. It has the
  best downstream rule F1 and EWT LAS, despite not having the best aggregate
  held-out LAS.
- Add valid-tree decoding before runtime integration and rerun this benchmark
  with the production decoder.
- Expand the evaluation with negative controls and natural prose. The controlled
  set is mostly positive construction examples, so perfect precision here does
  not establish real-world false-positive performance.
- Prioritize diverse constructions over more lexical variants: 80 examples did
  not improve on 50.

## Valid-tree decoder follow-up

The production-oriented decoder now selects one score-optimal root and repairs
cycles by attaching the minimum-loss cycle edge to the already root-connected
component. This guarantees termination, one root, and acyclicity while retaining
stable tie-breaking that can be reproduced in TypeScript.

| Canonical sentences | Held-out LAS | Critical LAS | Rule F1 | Exact sentence agreement | Invalid trees |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 97.57 | 97.37 | 99.29 | 99.00 | 0 |
| 25 | 98.68 | 99.52 | **99.77** | **99.67** | 0 |
| 50 | 98.48 | **99.88** | **99.77** | **99.67** | 0 |
| 80 | **99.03** | 99.52 | 99.53 | 99.33 | 0 |

Tree enforcement removed the 25-example crash and improved its rule F1 from
99.53 to 99.77. It also improved the no-rule-data baseline from 98.34 to 99.29,
recovering all four participial-appendage misses. The 50-example checkpoint
remains the candidate because it ties for best rule F1, has the best critical
LAS, and retains the strongest EWT result among the tied models.
