# writinglint-rulepack-reader-first

## 0.5.0

### Minor Changes

- f15b2e4: Add machine-readable split-point anchors and multi-dimensional magnitude metrics to sentence-load findings so automated rewrites can target real clause boundaries and measure partial improvement. Stamp structured SlopSift results with the producing ruleset version, and add a model-safe `brief` output format without product names, rule IDs, file paths, or source locations.

### Patch Changes

- Updated dependencies [f15b2e4]
  - writinglint-core@0.5.0

## 0.4.0

### Minor Changes

- 17fff83: Add an inspectable sequential reading trace and reader-first cognitive-load findings for concept introduction, relationship churn, dormant-thread reactivation, unresolved promises, undefined decision standards, interrupted procedure handoffs, and sustained working-memory pressure. Markdown extraction now exposes section, disclosure, quotation, and ordered-step structure so these findings can respect meaningful reading boundaries while preserving exact UTF-16 source ranges.

### Patch Changes

- Updated dependencies [17fff83]
  - writinglint-core@0.4.0

## 0.3.0

### Minor Changes

- 2a392fa: Require Node.js 24 or newer across the published WritingLint and SlopSift packages. Node.js 20 is no longer maintained, and the repository now builds, tests, deploys, and publishes with the current long-term support release.

### Patch Changes

- Updated dependencies [2a392fa]
  - writinglint-core@0.3.0

## 0.2.0

### Minor Changes

- Make reader-first linting stricter for loaded sentences, repeated fragments, label-led explanations, abstract reference chains, and explanatory brackets or dashes. Keep Markdown list items as separate parser sentences so the stricter limits judge each item instead of the complete list.

## 0.1.0

### Minor Changes

- Add reusable language foundations, the independent reader-first rulepack, and compact Stop-hook feedback for coding agents. Remove the standards-derived package, importer, corpus, dictionary, and conformance surface.

### Patch Changes

- Updated dependencies
  - writinglint-core@0.2.0
