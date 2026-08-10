# ASD-STE100 Docling importer

This experiment turns Docling's JSON representation of ASD-STE100 Issue 9 into structured data. It does not copy the standard into this repository. You must obtain the PDF yourself and keep both the conversion and parsed output outside the repository.

The importer reads Docling JSON instead of Markdown. Docling gives each block a page, bounding box, and source reference, and its table cells retain row and column spans. Those details are necessary because the generated Markdown flattens every heading to the same level and cannot reliably represent tables with merged cells.

## Parsing model

The document does not have one uniform structure, so the importer gives each major section its own handler:

- The front-matter handler preserves ordinary blocks and separately extracts the subject-to-rule index.
- The writing-rules handler finds the actual Part 1 boundary, groups the 53 rules into nine sections, and recovers rule titles even when Docling labels them as ordinary text or list items.
- The dictionary-introduction handler preserves the explanatory material before the word list.
- The word-list handler uses the semantic table headers rather than fixed physical column numbers. It groups continuation rows, parses the part of speech and verb forms, and maps the exceptional five-column callout table back to the four dictionary columns.

Every parsed block keeps its Docling reference, page, and bounding box. Dictionary cells keep both `rawText` and normalized `text`, along with a record of each normalization. A short, explicit correction list handles layout splits that were checked against Issue 9. The generic normalizer does not guess whether an arbitrary hyphen belongs in a word.

## Convert the PDF

Docling 2.113.0 produced the conversion used while developing this importer:

```sh
docling convert \
  /path/to/ASD-STE100_ISSUE9.pdf \
  --from pdf \
  --to json \
  --table-mode accurate \
  --output /path/outside/the/repository
```

Docling's command-line options can change between releases. Run `docling --help` if your installed version does not accept this command.

## Parse the conversion

```sh
npm run import:asd-ste100 -- \
  --input /path/outside/the/repository/ASD-STE100_ISSUE9.json \
  --output /path/outside/the/repository/ASD-STE100_ISSUE9.parsed.json
```

The command refuses to write extracted standard content inside the current repository unless you deliberately pass `--allow-repo-output`. This guard reduces the chance of committing licensed source material.

Issue 9 validation is on by default. It checks the page count, every expected rule identifier, the table count, the total number of part-of-speech entries, and the approved-entry count. Use `--no-validate-issue9` when developing support for another issue. Diagnostics show the first 20 findings by default; use `--max-issues <number>` or `--all-issues` to change that limit.

After parsing, verify that the local data and the product still agree:

```sh
npm run audit:asd-ste100 -- \
  --input /path/outside/the/repository/ASD-STE100_ISSUE9.parsed.json
```

The audit compares the 53 parsed rule identifiers with the product coverage catalogue, validates every referenced detector, and checks the dictionary invariants. It prints only counts and the source hash.

SlopSift can then use the same validated file without uploading or republishing it:

```sh
npm run slopsift -- manual.md \
  --rulepack asd-ste100 \
  --technical-mode procedural \
  --technical-standard-data /path/outside/the/repository/ASD-STE100_ISSUE9.parsed.json
```

Loading the file adds conservative dictionary checks. A known unapproved word produces an error. A known approved word used as a different parsed part of speech produces a warning because parser ambiguity still requires review. Unknown words remain silent because they can be project or industry terminology.

## Test the importer

The tests use an independently written synthetic Docling fixture. They do not contain text copied from the standard.

```sh
node --conditions=source --import tsx --test \
  experiments/asd-ste100-importer/test/*.test.ts

npx tsc --noEmit -p experiments/asd-ste100-importer/tsconfig.json
```

The fixture covers nested reference order, duplicate and misclassified rule headings, the subject index, continuation rows, part-of-speech parsing, normalization provenance, and a five-physical-column dictionary table. The complete local Issue 9 run remains a smoke test because the source document cannot be checked into the repository.

## Known boundary

The parser reports unlabeled text in a dictionary word column instead of silently deciding what it means. In Issue 9, four such rows describe a verb-form note or a related phrase. The raw row is preserved, but a later dictionary model should give these rows typed subentry fields before SlopSift generates lexical rules from them.
