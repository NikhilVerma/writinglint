# slopsift

## 0.3.0

### Minor Changes

- Add a document-aware `performed-revelation` rule for repeated headline-like
  payoffs, staged questions, and compressed takeaway paragraphs. Calibrate
  related rules against a local human-versus-AI A/B corpus
  so quoted absolutes, measured comparisons, explicit connectives, isolated
  parallelism, and long documents do not become warnings merely through volume.

### Patch Changes

- Updated dependencies
  - writinglint-rulepack-ai-style@0.4.0

## 0.2.2

### Patch Changes

- Detect comma splices independently of sentence length, and grade em-dash overuse using local clusters as well as whole-document frequency so unrelated prose cannot dilute a real pattern.
- Updated dependencies
  - writinglint-rulepack-ai-style@0.3.1

## 0.2.1

### Patch Changes

- 1c0e418: Refresh the shared build, test, documentation, browser-extension, and release
  toolchain. The consolidated dependency update is verified against the CLI
  package, browser editor, Chrome extension, VS Code extension host, and
  Cloudflare Worker bundle.

## 0.2.0

### Minor Changes

- d31b82d: Add four graph-backed, document-aware rules for compressed explanations:
  referential compression, premature closure, mirrored binary outcomes, and
  undefined central terms. The browser editor now preserves visible mouse
  selection across every paragraph and handles Ctrl/Cmd+A explicitly.

### Patch Changes

- Updated dependencies [d31b82d]
  - writinglint-rulepack-ai-style@0.3.0

## 0.1.8

### Patch Changes

- Updated dependencies [d3ff348]
  - writinglint-rulepack-ai-style@0.2.0

## 0.1.7

### Patch Changes

- c3e1369: Add document-aware rules for repeated dependency frames and unsupported outcome-claim stacks. Improve repeated-transition, semantic-redundancy, and uniform-structure detection with evidence, polarity, procedural-list, and confidence guards.
- Updated dependencies [c3e1369]
  - writinglint-rulepack-ai-style@0.1.6

## 0.1.6

### Patch Changes

- 99fd3cf: Prevent overlength prose blocks and Markdown tables from aborting a lint run by
  adding table boundaries, defensive parser chunking, and structured per-file
  runtime diagnostics.

  Extract visible Astro copy and static page metadata, lint substantial multiline
  prose templates in JavaScript and TypeScript, and report explicitly selected
  files that contain no extractable prose.

- Updated dependencies [99fd3cf]
  - writinglint-parser-node@0.1.6

## 0.1.5

### Patch Changes

- 2d2e53f: Publish versioned agent-facing rule metadata and rule URLs, and add a GitHub
  Actions annotation formatter to SlopSift.
- Updated dependencies [2d2e53f]
  - writinglint-rulepack-ai-style@0.1.5

## 0.1.4

### Patch Changes

- f9057e0: Expose the source extractor as a browser-safe `slopsift/extract` entry point so browser editors can lint Markdown with the same masking and exact offsets as the CLI.

## 0.1.3

### Patch Changes

- Catch formulaic "X then Y" sequencing, clause-level "X, not Y" contrasts,
  and balanced three-clause slogans.
- Updated dependencies
  - writinglint-rulepack-ai-style@0.1.4

## 0.1.2

### Patch Changes

- Add explicit website, documentation, GitHub, npm, and model-license links to
  the published package README.

## 0.1.1

### Patch Changes

- Expand graph-backed coverage for false agency, staged negative contrast, and
  dramatic fragments. SlopSift now suppresses semantic-redundancy in code comments,
  reports length-normalized JSON metrics, supports report-only `--exit-zero`, and
  provides explicit unmatched-pattern behavior for CI.
- Updated dependencies
  - writinglint-parser-node@0.1.2
  - writinglint-rulepack-ai-style@0.1.3

## 0.1.0

### Patch Changes

- Consume the public WritingLint parser dependency chain and verify the CLI
  through an isolated registry install.
- Updated dependencies

  - writinglint-core@0.1.1
  - writinglint-parser-node@0.1.1
  - writinglint-rulepack-ai-style@0.1.2

- Flag the emerging phrases “the real bottleneck” and metaphorical “load-bearing”
  as informational AI-writing tells, while preserving literal construction usage.
