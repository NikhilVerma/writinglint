# Technical-English evaluation candidates

This directory contains synthetic examples for the six ASD-STE100 Issue 9 references that the rulepack currently attempts to check: 3.6, 4.2, 5.1, 6.3, 6.6, and 8.1.

An AI agent wrote every checked-in example without copying sentences from the standard or another corpus. Each row starts with `review.status` set to `ai-candidate`. Human reviewers must approve each row before evaluation. A passing score cannot support a claim of ASD-STE100 conformance.

## Limitations

One AI generator produced the complete candidate set. The examples use deliberately balanced labels, paired positive and negative templates, and a narrow selection of maintenance and equipment domains. The resulting sample has generator and template bias. It is unrepresentative of production technical writing. The corpus does not estimate production prevalence. Its aggregate accuracy is diagnostic and does not estimate production performance. The checked-in data is visible to every person or agent that reads the repository, so none of it is a blind or secret holdout.

## What each row records

`candidates.jsonl` has one JSON object per candidate. A row records:

- the text, technical mode, primary standard reference, and expected detector result;
- exact expected rule IDs, finding counts, source substrings, and source ranges;
- an independently written rationale;
- a semantic family and template group;
- synthetic provenance and the author type;
- human-review state; and
- membership in either the rotating pool or the reserved public pool.

Source ranges use document-global UTF-16 code-unit offsets. `start` is inclusive and `end` is exclusive. This is the same convention used by WritingLint and JavaScript `String.prototype.slice`.

Positive and nearby negative examples share a semantic family. The splitter assigns the complete family to one split. This prevents small lexical changes and shared templates from crossing between development and evaluation.

## Public development and evaluation pools

Run the deterministic splitter from the repository root:

```sh
node --conditions=source --import tsx packages/rulepack-technical-english/eval/split.ts --seed ste-eval-v1
```

The seed rotates the `development` and `evaluation` assignments. It never moves a `reserved-public` family. Record the seed with every result so another contributor can reproduce the assignment.

An evaluation fold becomes exposed as soon as its results influence a detector. Changing the seed does not restore blindness to previously seen examples. The checked-in reserved pool stays public and can support regression or review work, but it must never be described as held out.

The evaluator defaults to development candidates and excludes unreviewed rows. During initial dataset review, the following command shows provisional disagreements while keeping the AI labels in candidate status:

```sh
node --conditions=source --import tsx packages/rulepack-technical-english/eval/evaluate.ts \
  --split development \
  --seed ste-eval-v1 \
  --allow-unreviewed-candidates
```

Running `evaluation` or `reserved-public` requires `--actor` and `--purpose`. The runner appends the exposure to `exposure-log.jsonl`. After the run, replace the event's `influencedDetectorDecisions: null` with `true` or `false`.

## Optional private final holdout

A final holdout must live outside the repository in a private JSONL file. Use the same candidate schema and set `evaluation.pool` to `external-final` for every row. Keep semantic families together, use human-approved labels, and have a second independent reviewer work without detector output. The evaluator rejects `--allow-unreviewed-candidates` for this split. Do not commit the file or its contents.

Open the private final set only after the detector version and decision policy are frozen:

```sh
node --conditions=source --import tsx packages/rulepack-technical-english/eval/evaluate.ts \
  --split final-holdout \
  --external-final /private/path/technical-english-final.jsonl \
  --open-final \
  --actor reviewer-name \
  --purpose "release evaluation"
```

The runner records the exposure and suppresses per-candidate final details. The aggregate result still exposes the set. If the result influences a detector or threshold, retire the external set and create a new private final set before making another held-out claim.

## Human review and promotion

A reviewer must use an authorized copy of ASD-STE100 Issue 9 and review one semantic family at a time:

1. Confirm that the wording is original and has no copied material from the standard or a third-party source.
2. Confirm the technical meaning, mode, primary reference, label, finding count, exact match text, and UTF-16 range.
3. Check that the positive and nearby negative differ only in a way relevant to the reference under test.
4. Check boundary counts manually when `boundary` is present.
5. Check whether another implemented rule should fire, and add every overlapping expected finding.
6. Reject ambiguous examples. Current detector output must not determine the corrected label.
7. For an accepted row, set `review.status` to `human-approved` and record the reviewer, ISO date, and notes.

Rejected rows remain useful as an audit trail, but the evaluator always excludes them. The `--allow-unreviewed-candidates` option includes only rows whose status is `ai-candidate`.

Dataset validation checks the recorded review state and structural invariants. It cannot establish the correctness of a linguistic judgment.

### Review command

First, list the pending development families:

```sh
npm run review:technical-english -- \
  --split development \
  --seed ste-eval-v1 \
  --list
```

Start an interactive review with your reviewer name:

```sh
npm run review:technical-english -- \
  --split development \
  --seed ste-eval-v1 \
  --reviewer "Your name"
```

The command displays both candidates in each semantic family, including the proposed labels, expected source ranges, boundary metadata, and rationales. It deliberately does not run or display the current detector. You approve, reject, or skip each candidate separately while its sibling remains visible for comparison. Every decision records the reviewer, date, and required notes. The command validates the complete dataset and replaces the JSONL file atomically after each confirmed family review.

Use `--family ste-42-technician-apostrophe` to review one family. The same command can review `evaluation` or `reserved-public` after changing `--split`; keep the development review separate from later evaluation decisions.

## Growing this into a contributed corpus

Large numbers matter only after provenance and review remain intact. Accept contributions as semantic families rather than isolated sentences. Each family should contain a triggering example, a nearby legitimate example, an independently written rationale, exact source ranges, a technical domain, and confirmation that the contributor did not copy text from the standard, a manual, or another restricted corpus.

Public contributions enter the rotating pool as unreviewed candidates. A reviewer who has access to an authorized copy of Issue 9 must label them without seeing detector output. Once a public example influences implementation, it is regression or evaluation history and cannot become a final holdout.

Keep contributor batches separate during review so generator, author, organization, and domain concentration can be measured. A large corpus dominated by one contributor or one sentence template is still narrow. Report counts by author source, domain, reference, document role, format, and semantic family rather than only reporting a total row count.

A genuine final holdout needs an independent collection path. Its contributors and reviewers must not expose the text to the repository or detector authors. Store it outside the repository, open it only through the external-final workflow, and retire it after the aggregate result influences a detector decision. The current repository does not contain such a set and does not claim blind held-out performance.

## Validation policy

The tests reject malformed data, duplicate normalized text, invalid references, modes, labels, rule IDs, missing provenance or review metadata, invalid UTF-16 ranges, inconsistent boundary counts, and group leakage. They do not run detectors against an external final holdout.

Run the focused checks with:

```sh
node --conditions=source --import tsx --test packages/rulepack-technical-english/test/eval-dataset.test.ts
npx tsc --noEmit -p packages/rulepack-technical-english/tsconfig.json
node --conditions=source --import tsx packages/rulepack-technical-english/eval/split.ts --seed ste-eval-v1
```

The checked-in candidates include adversarial constructions. When a detector disagrees with an unreviewed candidate, send the candidate for review and inspect the detector separately. The disagreement alone establishes neither judgment.

## Large deterministic conformance matrix

The candidate corpus measures reviewed linguistic judgments. A separate generated matrix stress-tests detector boundaries and product wiring at a much larger scale without pretending that template combinations are natural writing or held-out evidence.

```sh
npm run conformance:technical-english -- --scale 100
```

Each scale unit creates punctuation, contraction, possessive, sentence-length, paragraph-length, voice, and dictionary cases. The command above runs 3,100 complete parser-and-linter checks. Increase the scale for soak tests. Generated matrix rows are reproducible conformance checks, not corpus records, production samples, or evidence of general ASD-STE100 compliance.
