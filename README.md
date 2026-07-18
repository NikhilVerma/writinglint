# WritingLint

Deterministic linting for prose, powered by an owned dependency parser and
authorable TypeScript rules.

[![SlopSift on npm](https://img.shields.io/npm/v/slopsift?label=slopsift&color=111111)](https://www.npmjs.com/package/slopsift)
[![WritingLint on npm](https://img.shields.io/npm/v/writinglint?label=writinglint&color=2563eb)](https://www.npmjs.com/package/writinglint)
[![CI](https://github.com/NikhilVerma/writinglint/actions/workflows/ci.yml/badge.svg)](https://github.com/NikhilVerma/writinglint/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2563eb)](LICENSE)
[![SlopSift demo](https://img.shields.io/badge/demo-slopsift.dev-111111)](https://slopsift.dev)

WritingLint is the reusable engine. It parses text once, runs rulepacks over a
dependency graph and document structure, and returns exact source ranges with
plain-language diagnostics. Rules can inspect tokens, parts of speech,
dependency relations, sentences, paragraphs, and whole documents.

[SlopSift](https://slopsift.dev) is the focused product built on top. It packages
WritingLint's parser and AI-style rulepack as a zero-config CLI for finding
recognizable AI-writing habits in prose and source-code comments.

## Try SlopSift

SlopSift is published on npm and requires Node.js 20 or newer. No global install
is required:

```bash
bunx slopsift .
npx slopsift "docs/**/*.md"
```

Or install it in a project:

```bash
npm install --save-dev slopsift
npx slopsift .
```

Useful modes:

```bash
slopsift . --level info
slopsift . --quiet
slopsift . --exit-zero
slopsift . --format json
slopsift . --format json-lines
slopsift . --max-warnings 0
```

The default view reports errors and warnings. `--level info` includes broad
editorial review candidates, while `--quiet` reports high-confidence errors
only. Errors exit with status `1`; warnings can be made fatal with
`--max-warnings`. `--exit-zero` keeps findings visible without failing the run.
Invalid arguments, unmatched patterns, configuration failures, and runtime/model
failures exit with status `2`; use `--no-error-on-unmatched-pattern` only for
intentionally optional globs.

Run `slopsift --help` for glob, extension, ignore, model, and output options.

## WritingLint and SlopSift

The dependency direction is deliberate:

```text
SlopSift CLI
    -> WritingLint AI-style rulepack
        -> WritingLint core + parser contract
            -> compact ONNX parser runtime
```

WritingLint owns reusable parsing, configuration, rule execution, graph helpers,
and rulepacks. It can support house style, personal preferences, grammar,
clarity, or any other prose policy a team can encode.

SlopSift owns the narrower AI-slop experience: file discovery, prose/comment
extraction, confidence defaults, ESLint-like output, JSON contracts, and product
ergonomics. It consumes WritingLint rather than existing as a mode inside the
general WritingLint CLI.

## What SlopSift reads

- Markdown, MDX, reStructuredText, AsciiDoc, and plain text are linted as prose.
- HTML is linted as rendered text; metadata, scripts, styles, templates, SVG,
  code blocks, and comments are excluded.
- JavaScript, TypeScript, Python, Ruby, shell, YAML, TOML, SQL, Rust, Go, Java,
  C/C++, C#, Swift, Kotlin, PHP, CSS, Vue, Svelte, Astro, and other supported
  source formats are linted through their comments.
- Dependencies, generated output, Git metadata, and paths matched by
  `.gitignore` are skipped by default.

Extracted ranges are mapped back to original UTF-16 source locations so CLI and
editor diagnostics point to the right text.

## Confidence, not authorship claims

SlopSift grades writing patterns; it does not claim to determine who or what
wrote a document.

| Level | Meaning | Default exit behavior |
| --- | --- | --- |
| `error` | High-confidence, specific slop signature | exits `1` |
| `warning` | Likely issue that needs editorial judgment | reported; use `--max-warnings` to fail |
| `info` | Possible signal worth reviewing in context | hidden by default |

Rules can operate at sentence, paragraph, and document scale. A weak phrase may
stay informational on its own but become more important when it repeats or
clusters with independent signals nearby.

Raw finding counts grow with document length and should not be compared across
files as a quality score. JSON and JSON Lines results include `wordCount` and
`findingsPerThousandWords` for the extracted prose or comments at the selected
`--level`.

## Local model and privacy

The published `writinglint-parser-node` package includes the compact INT8 parser
and tokenizer. A normal npm or `bunx` run does not need Python, a hosted model,
or an API call. Text and source comments are processed locally.

The browser demo runs the corresponding ONNX model on-device through WebAssembly
and serves immutable model artifacts from `models.slopsift.dev`.

Model architecture, training, evaluation, quantization, provenance, hashes, and
release procedures are documented in
[`packages/slopsift/MODEL.md`](packages/slopsift/MODEL.md).

## Packages

| Package | Purpose |
| --- | --- |
| [`slopsift`](https://www.npmjs.com/package/slopsift) | Focused AI-slop CLI and in-process API |
| [`writinglint`](https://www.npmjs.com/package/writinglint) | General-purpose prose-lint CLI |
| [`writinglint-core`](https://www.npmjs.com/package/writinglint-core) | Document model, parser contract, rule API, configuration, and linter |
| [`writinglint-parser-node`](https://www.npmjs.com/package/writinglint-parser-node) | Local ONNX parser and bundled compact model |
| [`writinglint-rulepack-ai-style`](https://www.npmjs.com/package/writinglint-rulepack-ai-style) | AI-writing-style rules and scoring features |
| [`writinglint-rulepack-craft`](https://www.npmjs.com/package/writinglint-rulepack-craft) | General writing-craft rules |

The repository also contains the on-device SlopSift web demo.

## Programmatic SlopSift API

```ts
import { createSlopSift } from 'slopsift';

const slopsift = await createSlopSift();
const result = await slopsift.lintSource(
  'draft.md',
  'Moreover, this groundbreaking platform stands as a testament to innovation.',
  { level: 'warning' },
);

for (const lint of result?.lints ?? []) {
  console.log(lint.ruleId, lint.start, lint.end, lint.message);
}
```

A `SlopSift` instance reuses its parser sessions across documents. Tests and
alternate hosts can inject any parser that implements WritingLint's public
`Parser` contract.

## Authoring WritingLint rules

Rules are ordinary TypeScript. A rule declares metadata and returns listeners
for document events:

```ts
import { defineRule } from 'writinglint-core';

export const repeatedSetup = defineRule({
  meta: {
    name: 'repeated-setup',
    category: 'structure',
    docs: { description: 'Find repeated setup language.' },
  },
  create(context) {
    return {
      Sentence(sentence) {
        if (!sentence.text.startsWith('The key is')) return;
        context.report({
          sentence: sentence.dep,
          span: { start: sentence.start, end: sentence.end },
          message: 'State the point directly.',
        });
      },
    };
  },
});
```

See [`writinglint-core`](packages/core/README.md) for the parser, document, and
rule APIs. Existing rulepacks under `packages/` provide complete examples of
token-, graph-, paragraph-, and document-level rules.

## Repository development

The monorepo uses npm workspaces. Repository development requires the Node and
npm versions declared in [`package.json`](package.json).

```bash
npm ci
npm run check
npm run pack:check
npm run smoke:packed
```

Important commands:

```bash
npm run slopsift -- . --format json
npm run cli -- essay.md
npm run dev -w slopsift-web
```

`npm run check` typechecks, tests, and builds the libraries and applications.
`npm run smoke:packed` installs packed artifacts into a temporary project that
is not a workspace member, preventing local symlinks from hiding missing files
or dependencies. The publish workflow repeats the smoke test against the public
npm registry after a release.

## Research data and reproducibility

The repository includes synthetic rule-sensitivity fixtures, generation code,
training code, model manifests, checksums, and reported experiment results.
Third-party and maintainer-held prose corpora are not distributed: they may
contain copyrighted or unpublished text and are excluded by `.gitignore`.

This means the shipped runtime and deterministic-rule tests are reproducible
from the public repository, while corpus-dependent classifier metrics require
independently sourced data. Calibration notes report aggregate behavior without
redistributing source documents.

## Limitations

- A lint is an editorial signal, not proof that text was generated by AI.
- Low-confidence rules intentionally trade precision for review coverage.
- Dependency parsing is bounded by the compact model's English training data and
  maximum sequence length.
- Semantic questions such as factual support, contradiction, or whether a
  comparison is justified cannot be settled by syntax rules alone.

Please file false positives through the dedicated
[issue template](https://github.com/NikhilVerma/writinglint/issues/new/choose)
with the smallest text sample that reproduces the behavior.

## Contributing, releases, and security

- [Contributing guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)
- [Release process](RELEASING.md)
- [Roadmap](TODO.md)

Release workflows run isolated packed-package and public-registry consumer tests
before tags are pushed. Trusted-publisher setup and maintainer steps are kept in
the release guide rather than in application code.

## Acknowledgements

- [Universal Dependencies](https://universaldependencies.org/) for the public
  dependency-representation standard and English treebanks used in research.
- [Stanza](https://stanfordnlp.github.io/stanza/) for the independent reference
  parser used during development.
- Wikipedia's [Signs of AI
  writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) for part
  of the public rule taxonomy.
- [textlint](https://textlint.org), [Vale](https://vale.sh),
  [proselint](https://github.com/amperser/proselint), and
  [Harper](https://github.com/automattic/harper) for prior work in prose linting.

## License

Code and repository-owned model artifacts are available under the [MIT
License](LICENSE). Third-party datasets are not distributed.
