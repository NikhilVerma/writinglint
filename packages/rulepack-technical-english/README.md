# writinglint-rulepack-technical-english

Deterministic technical-English rules for WritingLint. The first release includes an independent, partial check of ASD-STE100 Issue 9.

```ts
import { Linter, resolveConfig } from 'writinglint-core';
import { descriptive } from 'writinglint-rulepack-technical-english';

const result = await linter.lint(text, resolveConfig(descriptive));
```

Use `procedural` for instructions and `descriptive` for explanatory text. The presets currently automate selected parts of rules 3.6, 4.2, 5.1, 6.3, 6.6, and 8.1. `ASD_STE100_ISSUE_9_COVERAGE` describes those checks and the work that still requires review.

This package does not include or redistribute the ASD-STE100 controlled dictionary. A clean automated run is therefore `review-required`, not proof that a document conforms to all 53 rules.

ASD does not certify, authorize, approve, or endorse this software. ASD-STE100 is a registered trademark of ASD. Refer to the [official ASD-STE100 website](https://www.asd-ste100.org/) for the standard and its terms.
