# writinglint-parser-node

## 0.3.0

### Minor Changes

- 2a392fa: Require Node.js 24 or newer across the published WritingLint and SlopSift packages. Node.js 20 is no longer maintained, and the repository now builds, tests, deploys, and publishes with the current long-term support release.

### Patch Changes

- Updated dependencies [2a392fa]
  - writinglint-core@0.3.0

## 0.2.0

### Minor Changes

- Add reusable language foundations, the independent reader-first rulepack, and compact Stop-hook feedback for coding agents. Remove the standards-derived package, importer, corpus, dictionary, and conformance surface.

### Patch Changes

- Updated dependencies
  - writinglint-core@0.2.0

## 0.1.7

### Patch Changes

- Bound ONNX inference to sequential batches of at most 16 sentence chunks and
  explicitly release intermediate tensors. Large documents now use stable
  parser memory instead of allocating one corpus-sized padded batch.

## 0.1.6

### Patch Changes

- 99fd3cf: Prevent overlength prose blocks and Markdown tables from aborting a lint run by
  adding table boundaries, defensive parser chunking, and structured per-file
  runtime diagnostics.

  Extract visible Astro copy and static page metadata, lint substantial multiline
  prose templates in JavaScript and TypeScript, and report explicitly selected
  files that contain no extractable prose.

## 0.1.5

### Patch Changes

- 4a228ef: Harden the optional Stanza development backend by validating its JSONL protocol and parser output fields.

## 0.1.4

### Patch Changes

- Ignore inherited JavaScript object properties during WordPiece vocabulary
  lookup so words such as `constructor` cannot be mistaken for native functions.

## 0.1.3

### Patch Changes

- Ship explicit model licensing and attribution with the bundled parser, while
  keeping the runtime code under MIT.

## 0.1.2

### Patch Changes

- Standardize the bundled fine-tuned parser manifest under the public
  WritingLint format identifier. Model weights and checksums are unchanged.

## 0.1.1

### Patch Changes

- Ship the owned compact ONNX parser and tokenizer as a self-contained public
  runtime.
- Updated dependencies
  - writinglint-core@0.1.1
