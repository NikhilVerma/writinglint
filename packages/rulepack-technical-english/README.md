# writinglint-rulepack-technical-english

Deterministic technical-English rules for WritingLint. The first release includes an independent, partial check of ASD-STE100 Issue 9.

```ts
import { Linter, resolveConfig } from 'writinglint-core';
import { assessAsdSte100Issue9, descriptive } from 'writinglint-rulepack-technical-english';

const result = await linter.lint(text, resolveConfig(descriptive));
const assessment = assessAsdSte100Issue9(result.lints);
```

Use `procedural` for instructions and `descriptive` for explanatory text. The presets currently automate selected parts of rules 3.6, 4.2, 5.1, 6.3, 6.6, and 8.1. The coverage constant, `ASD_STE100_ISSUE_9_COVERAGE`, connects each automated reference to its detector and lists the work that still requires review. The assessment helper, `assessAsdSte100Issue9`, returns `nonconformant` when an automated error is present and `review-required` otherwise.

Users who have an authorized local copy of Issue 9 can convert it with the repository's Docling importer. Pass the validated parser output to `parseAsdSte100Issue9StandardData`, then use `withAsdSte100StandardData`. This enables conservative checks for known unapproved dictionary words and part-of-speech mismatches. The standard data remains in the caller's process and is not part of this package.

```ts
import {
  parseAsdSte100Issue9StandardData,
  withAsdSte100StandardData,
} from 'writinglint-rulepack-technical-english';

const standardData = parseAsdSte100Issue9StandardData(localParsedJson);
const config = withAsdSte100StandardData('procedural', standardData);
```

The loader verifies the complete 53-reference catalogue and the dictionary invariants before enabling these checks. Unknown words stay silent because they can be valid project, industry, or subject-field terms. A part-of-speech mismatch is a warning rather than an automatic rejection.

The Issue 9 loader adapts its entries to WritingLint's standard-neutral
`TerminologyProvider`. Other technical-writing rulepacks can use the dictionary
detectors with an industry, organization, or project provider without adopting
the ASD-shaped data contract. Providers can also be layered so a local glossary
overrides a broader standard.

Sentence-length findings now include the count policy and every counted source
unit as structured evidence. A caller can supply annotations and a `CountPolicy`
for names, measurements, identifiers, or other groups that a standard counts as
one unit. Callers can also mark individual `DocumentRegion` values as
`procedural` or `descriptive`; those local modes take precedence over the
document-wide preset.

This package does not include or redistribute the ASD-STE100 controlled dictionary. A clean automated run is therefore `review-required`, not proof that a document conforms to all 53 rules.

ASD does not certify, authorize, approve, or endorse this software. ASD-STE100 is a registered trademark of ASD. Refer to the [official ASD-STE100 website](https://www.asd-ste100.org/) for the standard and its terms.
