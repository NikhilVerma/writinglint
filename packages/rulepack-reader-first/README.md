# writinglint-rulepack-reader-first

Reader-first prose checks for WritingLint. The pack detects cognitive load and unexplained jargon without enforcing a controlled dictionary or claiming compliance with an external standard.

```ts
import { Linter, resolveConfig } from 'writinglint-core';
import { recommended } from 'writinglint-rulepack-reader-first';

const result = await new Linter(parser).lint(text, resolveConfig(recommended));
```

The pack checks loaded sentences, oversized paragraphs, noun piles, repeated initialisms, abstract reference chains, subjectless fragment chains, repeated label-led explanations, and bracketed or dashed commentary. It reviews sentences after 24 words and warns at 32 words, even when the grammar is simple. The cross-sentence rules become stricter when weak habits repeat: one isolated fragment can pass while several nearby fragments become an error.

The `eval/strict-cases.jsonl` dataset contains generic bad/fixed pairs for these habits. The examples preserve the writing patterns found during private audits, but contain no private names, identifiers, or copied prose. Tests require each bad example to trigger its expected rule and each fixed example to pass the complete recommended pack.
