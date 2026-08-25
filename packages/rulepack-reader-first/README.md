# writinglint-rulepack-reader-first

Reader-first prose checks for WritingLint. The pack detects cognitive load and unexplained jargon without enforcing a controlled dictionary or claiming compliance with an external standard.

```ts
import { Linter, resolveConfig } from 'writinglint-core';
import { recommended } from 'writinglint-rulepack-reader-first';

const result = await new Linter(parser).lint(text, resolveConfig(recommended));
```

The pack checks loaded sentences, oversized paragraphs, terminology introduced too quickly, undefined decision standards, sustained buffer pressure, rapidly changing or abruptly resumed relationships, unresolved promises, noun piles, repeated initialisms, abstract reference chains, subjectless fragment chains, repeated label-led explanations, and bracketed or dashed commentary. It reviews sentences after 24 words and warns at 32 words, even when the grammar is simple. The cross-sentence rules become stricter when weak habits repeat: one isolated fragment can pass while several nearby fragments become an error.

Document-wide findings are part of the reader-first rule set, but their confidence still controls how prominently they appear. Low-confidence calibration signals appear at `info`; use the `strict` preset to include them, while the normal warning level includes document findings with stronger evidence.

`sentence-load` findings include candidate clause-boundary offsets and separate word, clause, label, punctuation, and nearby-load measurements. Consumers can use those fields to propose a real split and measure partial improvement even when the rewritten sentence still exceeds a threshold.

The `eval/strict-cases.jsonl` dataset contains generic bad/fixed pairs for these habits. The examples preserve the writing patterns found during private audits, but contain no private names, identifiers, or copied prose. Tests require each bad example to trigger its expected rule and each fixed example to pass the complete recommended pack.
