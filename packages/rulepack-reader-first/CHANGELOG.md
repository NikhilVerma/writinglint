# writinglint-rulepack-reader-first

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
