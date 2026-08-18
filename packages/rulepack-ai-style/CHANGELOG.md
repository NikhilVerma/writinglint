# writinglint-rulepack-ai-style

## 0.6.0

### Minor Changes

- 2a392fa: Require Node.js 24 or newer across the published WritingLint and SlopSift packages. Node.js 20 is no longer maintained, and the repository now builds, tests, deploys, and publishes with the current long-term support release.

### Patch Changes

- Updated dependencies [2a392fa]
  - writinglint-core@0.3.0

## 0.5.1

### Patch Changes

- Updated dependencies
  - writinglint-core@0.2.0

## 0.5.0

### Minor Changes

- Detect compressed technical explanations with graded signals for sustained passive voice, headline-style fragments, implementation-detail pileups, abstract process narration, agentless rationale fragments, and inline negative redefinitions. Preserve JSDoc paragraph boundaries so those findings stay locally calibrated and map to exact source ranges.

## 0.4.0

### Minor Changes

- Add a document-aware `performed-revelation` rule for repeated headline-like
  payoffs, staged questions, and compressed takeaway paragraphs. Calibrate
  related rules against a local human-versus-AI A/B corpus
  so quoted absolutes, measured comparisons, explicit connectives, isolated
  parallelism, and long documents do not become warnings merely through volume.

## 0.3.1

### Patch Changes

- Detect comma splices independently of sentence length, and grade em-dash overuse using local clusters as well as whole-document frequency so unrelated prose cannot dilute a real pattern.

## 0.3.0

### Minor Changes

- d31b82d: Add four graph-backed, document-aware rules for compressed explanations:
  referential compression, premature closure, mirrored binary outcomes, and
  undefined central terms. The browser editor now preserves visible mouse
  selection across every paragraph and handles Ctrl/Cmd+A explicitly.

## 0.2.0

### Minor Changes

- d3ff348: New chatbot-email tells and corporate-register rules.

  ai-style gains five rules, corpus-validated at zero human-doc false positives:
  `comma-splice` (clipped parataxis — "Thanks for the demo, I enjoyed it."),
  `agentless-opener` ("Notes attached, and they are …"), `setup-fragment` ("One
  thing I wanted to put on the table …"), `performed-candor` ("to be fully
  transparent"), and `filler-intensifiers` ("I am genuinely open"), the latter
  three under a new lint-only `performance` category.

  craft gains a `register` category with `stacked-nouns` (noun piles) and
  `nominalization` ("made a decision" → "decided").

## 0.1.6

### Patch Changes

- c3e1369: Add document-aware rules for repeated dependency frames and unsupported outcome-claim stacks. Improve repeated-transition, semantic-redundancy, and uniform-structure detection with evidence, polarity, procedural-list, and confidence guards.

## 0.1.5

### Patch Changes

- 2d2e53f: Publish versioned agent-facing rule metadata and rule URLs, and add a GitHub
  Actions annotation formatter to SlopSift.

## 0.1.4

### Patch Changes

- Catch negated relative-clause contrasts, formulaic "X then Y" sequencing, and
  balanced three-clause slogans while keeping single occurrences informational.

## 0.1.3

### Patch Changes

- Expand graph-backed coverage for false agency, staged negative contrast, and
  dramatic fragments.

## 0.1.2

### Patch Changes

- Require the public WritingLint parser dependency chain and verify release
  artifacts through an isolated registry install.
- Updated dependencies
  - writinglint-core@0.1.1

## 0.1.1

### Patch Changes

- Flag the emerging phrases “the real bottleneck” and metaphorical “load-bearing”
  as informational AI-writing tells, while preserving literal construction usage.
