# writinglint-core

The engine behind [WritingLint](https://github.com/NikhilVerma/writinglint): a
Document model over a dependency-parse + POS graph, an authorable Rule API
(`defineRule`), config resolution, and the `Linter`. Bring your own parser
(e.g. [`writinglint-parser-node`](https://www.npmjs.com/package/writinglint-parser-node)).

```ts
import { Linter, resolveConfig } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { recommended } from 'writinglint-rulepack-ai-style';

const linter = new Linter(await loadParser({ modelDir: './models/xsmall' }));
const { lints } = await linter.lint('Trust the graph, not the vibes.', resolveConfig(recommended));
```

See the [docs](https://writinglint.nikhilv.workers.dev) for the full API.

## Building language and standards rulepacks

WritingLint keeps reusable analysis in core and policy decisions in rulepacks.
The parser can identify its BCP 47 languages, model version, fingerprint, and
available annotations through `ParserDescriptor`. A rule can declare the
capabilities it requires; the linter records the rule as skipped when the active
parser cannot supply them.

Callers can give `Linter.lint()` structured source regions, independent span
annotations, and services without changing the parser:

```ts
const report = await linter.lint(text, config, {
  language: 'en',
  regions: [
    { id: 'step-1', role: 'step', mode: 'procedural', start: 0, end: 24 },
  ],
  annotations: [
    { kind: 'measurement', provider: 'units-v1', start: 8, end: 13 },
  ],
  services: { terminology },
});
```

Core provides these standard-neutral extension points:

- `DocumentRegion` for headings, lists, procedures, steps, notes, warnings,
  cautions, tables, quotations, code, and custom roles;
- `SpanAnnotation` for proper names, measurements, abbreviations, terms, and
  other independently produced annotations;
- `ParserDescriptor` and `RuleMeta.requires` for explicit capability checks;
- optional token lemmas, Universal Dependencies morphological features, and
  calibrated parser confidence;
- `TerminologyProvider`, `InMemoryTerminologyProvider`, and
  `LayeredTerminologyProvider` for standard, industry, organization, project,
  and document vocabularies;
- `CountPolicy` and `countSentenceUnits()` for inspectable, standard-specific
  word counting; and
- structured finding evidence, visible assumptions, and per-rule execution
  records.

The core does not decide whether a word, sentence, or construction conforms to
a standard. A rulepack combines these capabilities and remains responsible for
that interpretation.
