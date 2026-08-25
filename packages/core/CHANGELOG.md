# writinglint-core

## 0.5.0

### Minor Changes

- f15b2e4: Add machine-readable split-point anchors and multi-dimensional magnitude metrics to sentence-load findings so automated rewrites can target real clause boundaries and measure partial improvement. Stamp structured SlopSift results with the producing ruleset version, and add a model-safe `brief` output format without product names, rule IDs, file paths, or source locations.

## 0.4.0

### Minor Changes

- 17fff83: Add an inspectable sequential reading trace and reader-first cognitive-load findings for concept introduction, relationship churn, dormant-thread reactivation, unresolved promises, undefined decision standards, interrupted procedure handoffs, and sustained working-memory pressure. Markdown extraction now exposes section, disclosure, quotation, and ordered-step structure so these findings can respect meaningful reading boundaries while preserving exact UTF-16 source ranges.

## 0.3.0

### Minor Changes

- 2a392fa: Require Node.js 24 or newer across the published WritingLint and SlopSift packages. Node.js 20 is no longer maintained, and the repository now builds, tests, deploys, and publishes with the current long-term support release.

## 0.2.0

### Minor Changes

- Add reusable language foundations, the independent reader-first rulepack, and compact Stop-hook feedback for coding agents. Remove the standards-derived package, importer, corpus, dictionary, and conformance surface.

## 0.1.1

### Patch Changes

- Publish the owned parser contract and graph utilities without private runtime
  dependencies.
