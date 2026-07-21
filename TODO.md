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
- [ ] Freeze and version the JSON result schema as the agent integration contract.
- [x] Write the SlopSift model card and training/release runbook.
- [ ] Create distributable Codex and Claude Code skills that lint a draft,
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

- [ ] Publish a dedicated guide for running `slopsift` in GitHub Actions on
      Markdown, prose, and source-code comments, including pull requests from
      forks and changed-file-only workflows.
- [ ] Document the existing exit-code contract with copy-pasteable CI examples:
      `0` for an accepted lint result, `1` when configured findings fail the run,
      and `2` for invalid arguments, configuration, model, or runtime failures.
- [ ] Document `--level`, `--quiet`, and `--max-warnings` as separate controls
      for visibility and enforcement, with examples for advisory, warning-gated,
      and errors-only pipelines.
- [x] Add `--exit-zero` as an explicit report-only mode. It returns `0`
      when lint findings exist while preserving exit `2` for configuration or
      runtime failures; do not overload `--quiet`, which controls output only.
- [ ] Add tests covering clean input, warnings, errors, `--max-warnings`,
      `--quiet`, `--exit-zero`, malformed configuration, and missing models.
- [ ] Add a GitHub-native formatter or problem-matcher example so annotations
      appear on changed lines while retaining the stable JSON/JSON Lines output
      for other CI systems.
- [ ] Add an isolated example workflow that installs the public npm package,
      runs without workspace links or network model downloads, and verifies the
      expected exit status.

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
