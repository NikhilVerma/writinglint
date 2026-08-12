# writinglint-rulepack-reader-first

Reader-first prose checks for WritingLint. The pack detects cognitive load and unexplained jargon without enforcing a controlled dictionary or claiming compliance with an external standard.

```ts
import { Linter, resolveConfig } from 'writinglint-core';
import { recommended } from 'writinglint-rulepack-reader-first';

const result = await new Linter(parser).lint(text, resolveConfig(recommended));
```

The first release checks loaded sentences, oversized paragraphs, noun piles, and repeated initialisms that were never introduced. Each detector provides exact source ranges and nearby clear cases in its test suite.
