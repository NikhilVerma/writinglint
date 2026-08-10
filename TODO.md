# WritingLint roadmap

## Own the parser stack

WritingLint owns its parser contract and must ship only independently developed
code, models, fixtures, and documentation with auditable provenance.

### 1. Extract the parser contract

- [x] Define `DepToken` and `ParsedSentence` in `writinglint-core`.
- [x] Remove all public and type-only imports from the former non-public parser.
- [x] Use document-global UTF-16 character offsets in the owned contract.
- [ ] Add parser contract tests for ASCII, Unicode, emoji, punctuation, multiple
      sentences, and malformed input.
- [x] Keep Node and browser parser implementations behind adapters.
- [ ] Record model provenance, licenses, versions, and hashes in a
      machine-readable manifest.

### 2. Evaluate an independent reference parser

- [x] Run Stanza locally through an isolated `uv` environment.
- [x] Translate Stanza output into the owned parser contract.
- [ ] Compare its tokenization, POS tags, dependency heads, relations, and
      offsets with the needs of every existing rule.
- [ ] Create a gold regression corpus for the constructions WritingLint cares
      about most: coordination, `advcl`/`acl`, subjects, objects, modifiers,
      copulas, complements, obliques, apposition, and punctuation.
- [ ] Measure downstream rule precision and recall, not only parser UAS/LAS.

### 3. Build an owned native parser

- [ ] Audit licenses for each training treebank and pretrained component.
- [ ] Prototype a small encoder with POS, dependency-arc, and relation heads.
- [ ] Weight evaluation toward relations that affect WritingLint rules.
- [x] Export the selected model to ONNX and validate PyTorch/ONNX parity.
- [x] Implement production TypeScript tokenization/alignment and connect it to
      the exported graphs and valid-tree decoder.
- [ ] Benchmark browser WASM and browser WebGPU. INT8 quantization and the Node
      benchmark are complete; the live WASM deployment uses the same artifact.
- [x] Target one model and output contract across Node and browser WASM.
- [ ] Add confidence scores so rules can suppress uncertain structural matches.

#### Chosen architecture: TypeScript + owned ONNX model

Keep the product, rules, configuration, scoring, and graph helpers in
TypeScript. Python is allowed for training and export only; users must never
need Python or a long-running Python process.

Use one parser contract and one owned model across runtimes:

- Node CLI: `onnxruntime-node`.
- Browser: `onnxruntime-web`, with WASM as the broad fallback and WebGPU when
  supported.
- TypeScript: tokenization/alignment, dependency-tree decoding, exact offsets,
  rule execution, and confidence handling.
- Python/PyTorch: dataset preparation, teacher annotation, training,
  distillation, evaluation, quantization, and ONNX export.

Do not port the complete Stanza runtime. Its English pipeline is approximately
322 MB and composes tokenizer, MWT expansion, POS, lemma, two character language
models, pretrained word vectors, and a dependency parser. WritingLint only
needs sentence boundaries, word tokens, UPOS, heads, relations, confidence, and
exact offsets.

#### Compact parser model

Train an English model with one small contextual encoder and three task heads:

1. UPOS classification per word.
2. Biaffine dependency-arc scores over dependent/head pairs.
3. Dependency-relation scores for the selected dependent/head pairs.

The ONNX graph should return tensors rather than formatted dependency JSON.
TypeScript should enforce one root and an acyclic tree, beginning with greedy
head selection plus cycle repair and adding Chu–Liu/Edmonds decoding if evaluation
shows it is needed.

- [x] Implement and test valid-tree decoding before parser integration. The
      strict family holdout produced a cyclic greedy prediction that crashed a
      recursive graph rule, so independent head argmax is not shippable.

Evaluate three capacity points rather than assuming the largest is best:

| tier | parameters | approximate INT8 size | purpose |
| --- | ---: | ---: | --- |
| tiny | 10–20M | 12–25 MB | mobile/WASM baseline |
| small | 25–40M | 30–50 MB | intended production range |
| quality | 50–80M | 60–100 MB | accuracy ceiling and teacher assistant |

Ship an INT8 CPU/WASM model first. Consider an optional FP16 WebGPU artifact.
Benchmark model accuracy after every optimization; quantization is not presumed
lossless.

#### Tokenization and alignment

- [x] Build an English TypeScript tokenizer with exact document-global UTF-16
      offsets.
- [ ] Cover whitespace, punctuation, contractions, possessives, quotes,
      dashes, URLs, email, Markdown, decimals, emoji, and astral characters.
- [x] Maintain character → word → encoder-subword alignment.
- [x] Share identical preprocessing between Node and browser.
- [ ] Initially feed the owned word boundaries to Stanza so tokenizer and parser
      replacement can proceed independently.

#### Training and distillation

- [ ] Audit the license of every selected English UD treebank independently.
- [ ] Train on gold UD heads, relations, and UPOS labels.
- [ ] Build a legally usable prose corpus spanning essays, documentation,
      journalism, marketing, conversational writing, and AI-generated drafts.
- [ ] Use Stanza offline as a teacher to pseudo-label representative prose.
- [ ] Distill hard labels and, where accessible, teacher probability
      distributions into the compact student.
- [ ] Up-weight or explicitly monitor relations important to WritingLint:
      `conj`, `cc`, `advcl`, `acl`, `nsubj`, `obj`, `amod`, `advmod`, `cop`,
      `ccomp`, `xcomp`, `obl`, `case`, and `appos`.
- [ ] Add confidence calibration for rule-critical arcs and relations.

#### Acceptance criteria

Do not select a model using aggregate parser metrics alone. Gate every candidate
on all of the following:

- UPOS accuracy, UAS, LAS, root accuracy, and sentence-length slices.
- Per-relation precision and recall for WritingLint-critical relations.
- Precision and recall of every WritingLint structural rule using predicted
  parses.
- Exact highlights on Unicode, emoji, contractions, Markdown, and punctuation.
- Cold start, warm latency, peak memory, model bytes, and runtime bytes on Node
  CPU, browser WASM, and browser WebGPU.
- Out-of-domain prose and adversarial rewrites, not only held-out treebank text.

#### Implementation sequence

1. Freeze Stanza output and rule behavior into a parser evaluation corpus.
2. Implement owned tokenization and alignment.
3. Train small supervised baselines on licensed UD data.
4. Add Stanza teacher annotations and knowledge distillation.
5. Export the best candidate to ONNX and validate PyTorch/ONNX parity.
6. [done] Integrate `onnxruntime-node` behind the existing `Parser` interface.
7. Run Stanza and ONNX backends side by side until acceptance gates pass.
8. Restore static browser inference with WASM and optional WebGPU.
9. Profile before considering a Rust native host or Rust/WASM decoder.

Rust remains an optional packaging/performance layer, not the starting point.
Consider it only if profiling shows Node cold start, preprocessing, decoding, or
native CLI distribution is a material problem after ONNX inference works.

Initial performance targets:

- Quantized parser under 50–70 MB.
- Fast enough for interactive paragraph linting.
- POS accuracy above 96%.
- Rule-level accuracy equal to or better than the current engine.
- Exact character highlights without byte-offset conversion.

### 4. Add an optional writing model

The deterministic parser and rules remain the source of truth. A small LLM is
used only after linting for contextual explanation and repair.

- [ ] Add a provider-neutral `WritingAssistant` interface.
- [ ] Evaluate SmolLM2 360M Instruct and Qwen3 0.6B for local inference.
- [ ] Support an optional remote-provider tier for higher-quality rewrites.
- [ ] Pass structured lint evidence and editing constraints to the model.
- [ ] Require structured replacement candidates rather than free-form prose.
- [ ] Run every candidate back through WritingLint.
- [ ] Reject candidates that retain the finding, introduce new findings, or
      change protected names, numbers, quotations, or modality.
- [ ] Offer minimal, stronger, and explanatory edit modes.

### 5. Product direction

- [ ] Position the product around intentional, specific, reader-friendly prose
      rather than unverifiable claims about who authored text.
- [ ] Replace a single opaque score with evidence-backed dimensions such as
      specificity, directness, repetition, hedging, abstractness, rhythm,
      clause complexity, and voice consistency.
- [ ] Add style contracts and team terminology.
- [ ] Add document-level contradiction candidates.
- [x] Add paragraph boundaries, document-exit evidence aggregation, and
      deterministic nearby-paragraph repetition candidates.
- [x] Detect repeated dependency frames, recurring transitions, repeated
      paragraph templates, and unsupported outcome-claim stacks across nearby
      prose.
- [x] Extend semantic-redundancy candidates within paragraphs and suppress
      measurements, sources, examples, mechanisms, and polarity corrections.
- [ ] Train a paragraph-pair semantic redundancy and contradiction grader over
      deterministic candidates; include adjacent evidence/citation context.
- [ ] Add epistemic-overreach evaluation data covering absolutes, unsupported
      comparisons, pseudo-precision, causal claims, and technical invariants.
- [ ] Add a visual dependency-tree debugger for rule authors.
- [ ] Explore learning local preferences from accepted and rejected edits.

### IP boundary

- [ ] Implement against the public Universal Dependencies format and an
      independently written WritingLint contract.
- [ ] Do not copy or derive from any non-public source, weights, tokenizer
      artifacts, vocabularies, configuration, fixtures, or internal
      documentation.
- [ ] Confirm with counsel whether black-box compatibility comparisons are
      permitted.

## Immediate experiment: Stanza

- [x] Install Stanza and its English models through `experiments/stanza`.
- [x] Inspect output on representative WritingLint constructions.
- [x] Document model size, startup time, parse latency, and output quality.
- [x] Use Stanza as the temporary local adapter and development oracle.
- [ ] Investigate the work required to reproduce the necessary pipeline in
      TypeScript plus ONNX Runtime Web/WASM.

## Controlled technical English from first principles

Build the technical-English work as a capability of WritingLint, not as a
growing collection of isolated SlopSift regexes. The first release of
`writinglint-rulepack-technical-english` intentionally implements only five
detectors. They cover selected parts of ASD-STE100 Issue 9 rules 3.6, 4.2, 5.1,
6.3, 6.6, and 8.1. The other 47 references remain `review-required`.

The present categories are only buckets for those five detectors. They do not
describe complete coverage of words, sentences, paragraphs, or punctuation.
Do not let category names, website controls, or structured output imply broader
coverage than the evidence supports.

This program must improve the reusable engine before it expands the rulepack.
The dependency order is:

1. Preserve the structure and role of the source document.
2. Expose the linguistic annotations that controlled-language rules need.
3. Build deterministic terminology and word-count services on those contracts.
4. Make every finding explain which capability and evidence produced it.
5. Add detectors only after their evaluation data and release gates exist.
6. Let SlopSift and other products consume the resulting capabilities without
   duplicating assessment logic.

Full automatic conformance is not the goal. Some rules require the author to
understand meaning, risk, subject-field terminology, and document purpose. A
checker can establish a specific nonconformance or identify material for
review. It must not claim that silence proves conformance.

### 1. Make coverage an executable contract

- [ ] Replace the hand-built list of 53 identifiers with a versioned rule
      catalogue that records an independently written summary, mode, required
      capabilities, automated scope, exceptions, evidence type, and current
      implementation status for each reference.
- [ ] Use explicit coverage states such as `implemented`, `assisted`,
      `human-only`, `blocked-data`, and `not-started`. Do not collapse all
      non-automated work into one undifferentiated label.
- [ ] Link every implemented reference to one or more real detector IDs and
      fail tests when a detector or catalogue entry becomes orphaned.
- [ ] Record which checks actually ran for each result. Distinguish a completed
      automated pass from a check skipped because document structure,
      terminology, or parser capabilities were unavailable.
- [ ] Extend the assessment state with `incomplete` before adding optional
      capabilities. Keep `nonconformant` for established violations and
      `review-required` for completed automated checks that still need human
      review. Do not add `conformant`.
- [ ] Include executed, skipped, and human-only references with concise reasons
      in structured output. Version the result schema if this cannot remain a
      backward-compatible addition.
- [ ] Audit the website, CLI, editor, README, and package metadata so they say
      `partial ASD-STE100 checks` until the visible text also shows exact
      coverage.

#### Acceptance criteria

- Every standard-related status can be derived from the rule catalogue, the
  capabilities available for that run, and the findings produced during that
  run. No interface maintains a separate coverage table or assessment formula.
- A missing parser feature or terminology source cannot silently produce a
  cleaner assessment.
- A test fails if a product describes an unimplemented reference as automated.

### 2. Preserve document structure in the core model

The current `Document` contract contains text, blank-line paragraphs,
sentences, and tokens. Controlled-language rules also need to know what each
source region is doing.

- [x] Add a source-structure contract that can represent headings, paragraphs,
      vertical lists, list items, procedure steps, notes, warnings, cautions,
      tables, table cells, quoted text, labels, placards, and code or metadata
      exclusions without losing exact UTF-16 source ranges.
- [x] Keep source structure separate from syntactic parsing. Extractors own the
      source tree; parsers annotate the text inside its lintable regions.
- [ ] Extend Markdown, HTML, MDX/Astro, plain-text, and source-comment
      extraction to return typed regions instead of only a flattened string.
- [ ] Preserve the existing `sourceRange()` guarantee for every node and every
      lint. A structural rewrite must not regress exact editor highlights.
- [x] Represent procedural and descriptive mode per region. A procedure can
      contain a 25-word note, and one document can contain procedures,
      descriptions, and safety instructions at the same time.
- [ ] Let callers annotate plain text with region roles when the format cannot
      express them. Keep heuristic role inference advisory and visible.
- [x] Add rule listeners or queries for structural nodes without breaking the
      existing `Document`, `Paragraph`, `Sentence`, and `Token` listeners.
- [ ] Define how tables, hard line wraps, carriage returns, list punctuation,
      and generated source affect sentence and paragraph boundaries.

#### Acceptance criteria

- Node, browser, CLI, and editor integrations construct the same structure and
  source ranges for the same input.
- Rules can distinguish an instruction, a note, a warning, and descriptive
  prose without relying on one global CLI flag.
- Existing AI-style rules retain their current behavior unless a deliberate
  migration fixture documents the change.

### 3. Expand the parser and annotation contracts

The compact parser currently supplies surface tokens, UPOS tags, dependency
heads, and relations. Its lemma is only the lowercased surface form. That is not
enough for controlled verb forms, word senses, noun groups, or calibrated
structural findings.

- [x] Add a versioned `ParserCapabilities` declaration. Candidate capabilities
      include real lemmas, morphological features, calibrated UPOS confidence,
      calibrated dependency confidence, noun-phrase spans, proper-name spans,
      abbreviation spans, and units of measurement.
- [x] Extend `DepToken` with optional, parser-neutral morphological features
      needed for tense, mood, verb form, voice, person, number, degree, and
      possessive constructions.
- [ ] Train or add owned heads for the selected annotations. Do not infer that
      lowercase text is a lemma or that a POS tag establishes tense.
- [ ] Add confidence to rule-critical token and arc predictions so detectors
      can demote or suppress findings when their required parse is uncertain.
- [ ] Evaluate noun-phrase and proper-name grouping as separate deterministic
      or model-backed annotation stages instead of hiding them inside
      individual rules.
- [ ] Train and evaluate on controlled technical prose, including valid STE
      constructions that differ from ordinary Standard English grammar.
- [ ] Make every rule declare its required parser capabilities. The linter must
      skip or demote the rule explicitly when the active parser cannot supply
      them.
- [ ] Version model manifests and annotation contracts so Node and browser
      cannot accidentally load a model with an incompatible output surface.

#### Acceptance criteria

- Parser contract tests cover every optional capability and its absent state.
- A rule that needs morphology cannot run against a parser that exposes only
  UPOS and dependencies.
- Per-capability accuracy and downstream rule precision are release gates; an
  increase in aggregate UAS or LAS is not sufficient.

### 4. Build an STE-specific counting service

Sentence length cannot use `sentence.words.length` as its final definition.
ASD-STE100 gives special treatment to structural and lexical groups.

- [x] Introduce a parser-independent `CountUnit` service that explains how raw
      source spans become controlled-language words.
- [ ] Implement the structural effect of a colon before a vertical list.
- [ ] Count parenthetical text as one unit when the applicable rule requires it.
- [ ] Group numbers with units of measurement, abbreviations, alphanumeric
      identifiers, quoted text, titles, headings, placards, labels, and proper
      names according to the selected standard profile.
- [ ] Count permitted hyphenated groups as one unit while retaining the source
      spans of their component words.
- [x] Return an inspectable count breakdown with every sentence-length finding.
      The user must be able to see why the checker counted 21 words.
- [ ] Make procedural and descriptive sentence-length rules consume this
      service instead of parser token counts.
- [ ] Add boundary fixtures for every counting exception and for combinations
      of exceptions in one sentence.

#### Acceptance criteria

- The 20-word and 25-word detectors cannot be described as complete until all
  applicable counting exceptions pass official-rule-derived, independently
  written fixtures.
- Node and browser produce identical count units and findings.
- Count explanations map every unit back to exact source text.

### 5. Add a terminology and controlled-dictionary boundary

Do not embed dictionary knowledge directly in detectors. Define a provider
contract that can support an official dataset if redistribution rights are
obtained, a user-supplied local dataset, and organization-specific terminology.

- [x] Define a `TerminologyProvider` interface for approval status, permitted
      part of speech, approved meanings, permitted forms, suggested
      alternatives, technical nouns, technical verbs, and provenance.
- [x] Support layered terminology: standard vocabulary, industry vocabulary,
      organization vocabulary, project vocabulary, and document-local terms.
- [ ] Keep all terminology processing local by default and make imported
      datasets versioned, hashed, and auditable.
- [ ] Provide an administration workflow for approving technical nouns and
      technical verbs. Unknown terms must not generate permanent noise that
      trains writers to ignore the checker.
- [ ] Distinguish `unapproved`, `unknown`, `known technical term`, and `used in
      an unapproved grammatical role`.
- [ ] Treat approved meaning as a word-sense problem. Deterministic matches can
      establish violations; ambiguous uses remain review candidates.
- [ ] Add document-level identity tracking so the checker can find inconsistent
      terminology without assuming that every synonym refers to the same item.
- [ ] Audit copyright, trademark, and redistribution rights before creating or
      publishing a machine-readable derivative of the ASD-STE100 dictionary.
      Until that audit is complete, require an independently authored or
      user-supplied data source.

#### Acceptance criteria

- The rulepack package remains usable without proprietary or unaudited data.
- Every terminology finding names the provider, dataset version, matched entry,
  and applicable local override.
- A missing organization glossary produces a visible capability limitation,
  not thousands of confident unknown-word errors.

### 6. Make evidence a first-class rule output

- [ ] Extend rule metadata with standard references, applicable document roles,
      required parser and terminology capabilities, automated scope, known
      exceptions, and evaluation provenance.
- [x] Add structured evidence to findings. Evidence can include matched tokens,
      dependency relations, morphological features, structural roles,
      terminology entries, count units, and document-level comparisons.
- [ ] Separate detector confidence from enforcement severity and from coverage
      completeness. One field must never stand in for all three concepts.
- [ ] Make a rule report the exact assumption behind an advisory result, such
      as `procedure role inferred` or `technical term list unavailable`.
- [ ] Keep messages readable without requiring users to understand parser
      labels. Detailed evidence is available for debugging and machine
      consumers, while the primary explanation remains plain English.
- [ ] Add a visual evidence debugger for rule authors that displays source
      structure, count units, terminology matches, tokens, morphology,
      dependencies, confidence, and the final rule decision together.

#### Acceptance criteria

- Every error has enough inspectable evidence to reproduce the decision.
- Warnings state what judgment remains with the writer.
- CLI, JSON, browser, VS Code, Chrome, and agent hooks consume one canonical
  finding and assessment contract.

### 7. Expand detectors in dependency order

Do not implement this list as independent regexes. Each group starts only after
its required contracts and evaluation fixtures exist.

#### Syntax and morphology

- [ ] Add permitted verb-form and tense checks, including complex auxiliary
      constructions and restricted `-ing` forms.
- [ ] Distinguish past participles used as adjectives from passive verb forms.
- [ ] Detect actions hidden in nouns or other parts of speech when an approved
      verb should describe the action.
- [ ] Check imperative form in procedural instructions and reject imperative
      commands in descriptive regions where they are not permitted.
- [ ] Add graded article and demonstrative-adjective checks only after noun
      phrases, countability exceptions, and identifier contexts are available.
- [ ] Add phrasal-verb and American-spelling checks through terminology and
      morphology services.

#### Source structure and procedure logic

- [ ] Check multi-word noun length and the introduction of shorter forms.
- [ ] Detect multiple instructions in one sentence, while preserving the
      simultaneous-action and immediate-result exceptions.
- [ ] Check that a required condition appears before its command and is divided
      from it correctly.
- [ ] Detect commands inside notes and distinguish informational notes from work
      steps.
- [ ] Check vertical-list use and connecting phrases using actual structural
      nodes rather than punctuation alone.
- [ ] Check permitted uses of hyphens and parentheses using noun groups,
      document roles, and count units.
- [ ] Check safety instructions for a risk label, a command or prior condition,
      and an explanation of the risk or possible result. Keep risk severity and
      factual adequacy under human control.

#### Terminology and meaning

- [ ] Add dictionary approval, permitted part of speech, approved forms, and
      deterministic alternative checks through `TerminologyProvider`.
- [ ] Add technical-noun and technical-verb role checks with local terminology
      overrides.
- [ ] Detect inconsistent names for the same identified item when document
      references or terminology data establish that identity.
- [ ] Assist with approved meaning and word-for-word replacement, but do not
      automatically rewrite when the replacement could change meaning.

#### Discourse and human-review assistance

- [ ] Build evidence for gradual information flow, logical key phrases,
      paragraph relatedness, one-topic paragraphs, and terminology consistency.
- [ ] Treat topic-sentence, meaning-preservation, risk, and document-purpose
      judgments as assisted review unless evaluation establishes a narrower
      deterministic case.
- [ ] Do not count an assisted discourse signal as proof that its complete
      standard reference was automatically checked.

### Current implementation checkpoint

- [x] Convert an authorized local Issue 9 PDF with Docling and parse front
      matter, all 53 rule references, the dictionary introduction, and 275 word
      list tables without committing the extracted standard.
- [x] Validate the parser output before the product can use it. The runtime
      checks the page count, rule catalogue, parser errors, dictionary counts,
      source hash, and entry provenance.
- [x] Let the library, CLI, homepage editor, and full browser editor load the
      validated file locally. The package remains useful without that file and
      does not redistribute the dictionary.
- [x] Add conservative data-assisted checks for a known unapproved word and a
      known word used as a different parsed part of speech. Unknown words stay
      silent because they can be valid local terminology.
- [x] Record the loaded source fingerprint and the references that actually ran
      in the standard assessment.
- [x] Add a generated 3,100-case parser-and-linter conformance matrix and keep
      it separate from the reviewed candidate corpus.
- [ ] Collect and independently review a private external final holdout. The
      repository has the sealed evaluation workflow, but it must not claim a
      blind result until independent contributors supply data that detector
      authors have not seen.

### 8. Build the evaluation system before broad claims

- [ ] Create an independently authored, provenance-tracked technical-English
      corpus with procedures, descriptions, notes, warnings, cautions, lists,
      tables, labels, quoted text, and mixed-role documents.
- [ ] Give every detector triggering fixtures, boundary fixtures, and nearby
      legitimate cases that must not fire.
- [ ] Preserve a genuinely unseen evaluation split for parser and rule changes.
      User-provided held-out failures become regression fixtures only after the
      underlying change is complete.
- [ ] Separate three dataset roles: reviewed regression fixtures for daily
      development, deterministic group-level folds that can rotate during
      evaluation, and a sealed final holdout used only for release decisions.
- [ ] Keep final-holdout text outside the repository and ordinary agent context.
      A checked-in set can be reserved by policy, but it is visible to any
      repo-reading model and cannot support a claim of blind evaluation.
- [ ] Split semantic and template families atomically. Lexical variants,
      paraphrases, and positive/negative siblings must never appear on opposite
      sides of a split.
- [ ] Record when a fold has been inspected. After its results influence a
      detector or parser decision, that fold is evaluation history and cannot
      be described as held out for the revised system.
- [ ] Treat AI-authored examples as unreviewed candidates, not ground truth.
      Require a human reviewer to confirm the text, expected rule, expected
      outcome, rationale, document role, and family ID before promotion into a
      regression fold or release evaluation.
- [ ] Measure precision, recall, noise, and silence for each detector. Report
      results separately by source format, document role, technical domain,
      sentence length, and parser confidence.
- [ ] Establish minimum precision for errors and warnings before promoting a
      detector. Prefer demotion or an explicit capability limitation over
      hiding plausible evidence or shipping a noisy error.
- [ ] Test valid controlled-language prose that does not follow ordinary
      Standard English grammar.
- [ ] Run every evaluation through Node and browser implementations and compare
      findings, evidence, source ranges, and assessments byte-for-byte where the
      output contract permits it.
- [ ] Add performance gates for cold start, warm latency, peak memory, model
      size, terminology database size, and incremental editor updates.

#### Release gate for each reference

A standard reference can move to `implemented` only when:

1. Its prerequisites are represented by versioned core contracts.
2. Its detector has positive, negative, boundary, and mixed-context fixtures.
3. Its held-out precision, recall, noise, and silence are recorded.
4. Its source ranges and structured evidence are reproducible.
5. Node and browser behavior agree.
6. Documentation states the automated scope and remaining human judgment.
7. The run-time assessment can prove that the detector actually executed.

### 9. Product and migration work

- [ ] Keep the current five detectors and result schema stable while the new
      contracts are introduced behind additive interfaces.
- [ ] Migrate sentence length to `CountUnit` first because it exercises source
      structure, lexical grouping, evidence, and cross-runtime parity together.
- [ ] Migrate passive voice second to exercise morphology, dependency
      confidence, document role, and descriptive exceptions.
- [ ] Add a coverage panel to the browser and CLI that shows implemented,
      assisted, skipped, and human-only references for the current run.
- [ ] Let users import or select a terminology profile without uploading it.
- [ ] Persist rulepack, document-role, and terminology selections consistently
      across browser, CLI configuration, editors, and agent hooks.
- [ ] Update agent feedback so it never asks a model to repair a skipped check
      or presents a review candidate as a proven violation.
- [ ] Publish model, terminology, rule-catalogue, and evaluation provenance with
      every release that changes technical-English behavior.

### Critical path

1. Coverage catalogue and capability-aware assessment.
2. Structured document and region-role contract.
3. Parser capabilities, morphology, and confidence.
4. STE-specific count units and sentence-length migration.
5. Terminology provider and local glossary workflow.
6. Evidence-bearing finding contract and debugger.
7. Syntax and structure detector expansion.
8. Terminology and discourse assistance.
9. Product coverage UI and release evidence.

## SlopSift

Build a focused, agent-facing product on top of the WritingLint engine. Its
promise is narrower and more memorable: stop AI-generated prose from shipping
with recognizable AI-slop constructions.

- [x] Split `slopsift` into its own consumer package, binary, tests, docs, model
      cache lifecycle, and exit-code contract. It is not a WritingLint CLI mode.
- [x] Publish the dedicated `slopsift` package while keeping the rules and parser
      in reusable WritingLint packages.
- [x] Add directory/glob discovery, `.gitignore`, Markdown/prose handling,
      source-comment extraction, stylish output, JSON, and JSON Lines.
- [x] Freeze and version the JSON result schema as the agent integration contract.
- [x] Write the SlopSift model card and training/release runbook.
- [x] Create a distributable Agent Skill that lints a draft,
      revise only supported findings, rerun the CLI, and stop when clean.
- [ ] Add a bounded iteration count and meaning-preservation guardrails.
- [ ] Add fixtures demonstrating bad draft → revised draft → clean exit.
- [x] Build the standalone SlopSift landing page and on-device browser demo.
- [x] Make `slopsift.dev` the canonical product domain and serve the model from
      immutable paths on `models.slopsift.dev`.
- [x] Preserve path and query parameters in permanent redirects from
      `sloplint.dev`, its `www` host, and its legacy model host.
- [x] Build a Manifest V3 Chrome extension MVP with local WASM inference,
      editable-field diagnostics, and severity controls.
- [x] Build a desktop VS Code extension MVP with Problems diagnostics,
      debounced linting, commands, settings, and local native inference.
- [ ] Keep the Chrome extension labeled experimental and untested until its
      manual QA matrix passes; do not advertise it on the SlopSift landing page.
- [ ] Give SlopSift its own repository, release workflow, changelog, and domain.
- [ ] Complete manual Chrome QA across Gmail, Notion, GitHub, Google Docs, and
      representative textarea and contenteditable editors.
- [ ] Finish manual VS Code QA on Linux, Windows, remote workspaces, and plain
      text. Automated extension-host tests cover Markdown and source comments on
      macOS, including VS Code 1.96 (the minimum supported release).
- [x] Verify GitHub publishes all five platform-specific VSIX builds
      automatically using the Marketplace-only `VSCE_PAT` secret.
- [ ] Replace the temporary Marketplace PAT with Microsoft Entra/OIDC before
      the token expires on October 19, 2026 and global PATs retire.
- [x] Pin the release manifest and verify every downloaded model artifact by
      byte count and SHA-256 before loading it.
- [x] Define immutable SlopSift R2 paths and bundle the compact model in npm,
      Chrome, and VS Code release artifacts.

### CI and GitHub integration

- [x] Publish a dedicated guide for running `slopsift` in GitHub Actions on
      Markdown, prose, and source-code comments, including pull requests from
      forks and changed-file-only workflows.
- [x] Document the existing exit-code contract with copy-pasteable CI examples:
      `0` for an accepted lint result, `1` when configured findings fail the run,
      and `2` for invalid arguments, configuration, model, or runtime failures.
- [x] Document `--level`, `--quiet`, and `--max-warnings` as separate controls
      for visibility and enforcement, with examples for advisory, warning-gated,
      and errors-only pipelines.
- [x] Add `--exit-zero` as an explicit report-only mode. It returns `0`
      when lint findings exist while preserving exit `2` for configuration or
      runtime failures; do not overload `--quiet`, which controls output only.
- [ ] Add tests covering clean input, warnings, errors, `--max-warnings`,
      `--quiet`, `--exit-zero`, malformed configuration, and missing models.
- [x] Add a GitHub-native formatter or problem-matcher example so annotations
      appear on changed lines while retaining the stable JSON/JSON Lines output
      for other CI systems.
- [ ] Add an isolated example workflow that installs the public npm package,
      runs without workspace links or network model downloads, and verifies the
      expected exit status.

### Agent legibility

- [x] Generate `llms.txt` and `llms-full.txt` from the package metadata, CLI
      contract, docs, rule catalogue, and Agent Skill.
- [x] Serve Markdown alternatives for public documentation and rule pages when
      clients request `Accept: text/markdown`.
- [x] Publish a versioned JSON rule catalogue and JSON result schema on the
      website and inside the npm package.
- [x] Add an SEO-indexable page for every rule, including its severity,
      confidence, matching method, source, and false-positive feedback path.
- [ ] Consider a thin local MCP wrapper only when users need tool discovery
      beyond the CLI and Agent Skill. Keep the core linter protocol-neutral.
- [ ] Explore a separate agent-legibility checker for sites, documentation,
      schemas, and automation contracts; do not mix it into writing analysis.

### Open-source release blockers

- [ ] Coordinate the Astro 5 → supported Astro/Starlight major upgrade for both
      sites. The current production audit reports Astro XSS/SSRF advisories;
      forcing the major in isolation risks breaking both builds.
- [ ] Remove the `onnxruntime-node` install-time `adm-zip <0.6.0` advisory when
      upstream accepts the patched range, or validate an ONNX Runtime downgrade.
      npm did not apply a root override outside the dependency's declared
      `^0.5.16` range, so an ineffective override was not retained.
- [ ] Enable GitHub private vulnerability reporting, secret scanning with push
      protection, Dependabot security updates, required CI/dependency-review
      checks, tag protection, and approval on the `npm` environment.
- [ ] Configure `publish.yml` as the trusted publisher for every public npm
      package, perform the first OIDC publish, then disallow token publishing.
- [ ] Bootstrap the unscoped `writinglint` npm package, configure its trusted
      publisher, remove it from Changesets' ignore list, and restore its
      published-package smoke test. Until then, only the source preview is
      available; SlopSift and the reusable WritingLint libraries publish
      independently.
