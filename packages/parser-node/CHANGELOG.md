# writinglint-parser-node

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
