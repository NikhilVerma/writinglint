# SlopSift

An opinionated CLI that checks prose and source-code comments against selectable
writing policies. It is a separate product built on the WritingLint engine;
the AI-style rulepack remains its zero-configuration default.

[![npm version](https://img.shields.io/npm/v/slopsift?label=npm&color=111111)](https://www.npmjs.com/package/slopsift)
[![CI](https://github.com/NikhilVerma/writinglint/actions/workflows/ci.yml/badge.svg)](https://github.com/NikhilVerma/writinglint/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/NikhilVerma/writinglint?label=stars&color=111111)](https://github.com/NikhilVerma/writinglint/stargazers)
[![Code license: MIT](https://img.shields.io/badge/code-MIT-2563eb)](https://github.com/NikhilVerma/writinglint/blob/main/LICENSE)
[![Model license: CC BY-SA 4.0](https://img.shields.io/badge/model-CC_BY--SA_4.0-2563eb)](https://github.com/NikhilVerma/writinglint/blob/main/packages/parser-node/MODEL_LICENSE.md)

[Website](https://slopsift.dev) · [Documentation](https://slopsift.dev/docs/) ·
[Rules](https://slopsift.dev/rules/) ·
[GitHub Actions](https://slopsift.dev/docs/github-actions/) ·
[Agent Skill](https://skills.sh/NikhilVerma/slopsift) ·
[GitHub](https://github.com/NikhilVerma/writinglint) ·
[npm](https://www.npmjs.com/package/slopsift)

## Let your coding agent fix its own writing

The Claude Code and Codex plugin checks each completed response automatically.
Warnings and errors go back to the agent for a bounded rewrite; informational
findings never interrupt the turn.

```bash
npx slopsift@0.7.0 agent doctor --host claude-code
npx slopsift@0.7.0 agent doctor --host codex
npx slopsift@0.7.0 agent demo
```

The doctor checks the installed client and plugin, then exercises the real
reject-then-accept decision with a known-bad draft and a clean rewrite. See
[AGENT-HOOKS.md](./AGENT-HOOKS.md) for installation and the live agent test.

## Lint files yourself

```bash
bunx slopsift .
bunx slopsift "docs/**/*.md" "src/**/*.{ts,tsx}"
bunx slopsift . --format json
bunx slopsift . --format github
bunx slopsift . --level info
bunx slopsift . --exit-zero
```

Select a rulepack when you need a different writing policy. The option is
repeatable, so AI-style and technical-English checks can run together:

```bash
slopsift manual.md --rulepack asd-ste100
slopsift procedure.md --rulepack asd-ste100 --technical-mode procedural
slopsift procedure.md --rulepack asd-ste100 --technical-standard-data /local/ASD-STE100_ISSUE9.parsed.json
slopsift docs/ --rulepack ai-style --rulepack asd-ste100
```

The `asd-ste100` alias runs an independent, partial ASD-STE100 Issue 9 check. If you have an authorized local copy of the standard, `--technical-standard-data` accepts the validated output from the repository's Docling importer and adds conservative dictionary checks. SlopSift reads the file locally and reports its source fingerprint; the package does not contain or redistribute the controlled dictionary.
It currently automates selected parts of rules 3.6, 4.2, 5.1, 6.3, 6.6, and
8.1. JSON output includes `standardAssessment`: automated violations produce
`nonconformant`; a clean automated run produces `review-required`. It cannot
produce `conformant` until the controlled dictionary, project terminology, and
meaning-based rules have also been reviewed.

ASD does not certify, authorize, approve, or endorse SlopSift. ASD-STE100 is a
registered trademark of ASD. Obtain the standard from the
[official ASD-STE100 website](https://www.asd-ste100.org/).

The `slopsift` package and executable deliberately share a name, so both
`bunx slopsift .` and `npx slopsift .` work without a package override. CI
installs its packed tarball into an isolated non-workspace project before every
release and repeats the smoke test against the public registry afterward.

The optional dirty-tree and transcript checks let the agent fix documentation
in changed files and use prose stored during the active turn as correction
context. Pi can queue the same findings as an automatic follow-up turn. The
[agent guide](./AGENT-HOOKS.md) documents those modes, privacy boundaries, and
tests.

SlopSift grades every finding by detector confidence:

- `error` / high confidence: a strong, specific slop signature; exits non-zero.
- `warning` / medium confidence: likely slop that still needs editorial judgment.
- `info` / low confidence: a possible signal to review; never fails a run by itself.

The default `--level warning` reports errors and warnings. Use `--level info` for
the strict editorial view, `--level error` (or `--quiet`) for high-confidence CI,
and `--max-warnings 0` when warnings should fail CI. JSON format uses ESLint's
numeric severities (`2`, `1`, `0`), retains `level` plus `confidence`, and adds
`ruleUrl`, `wordCount`, and `findingsPerThousandWords` for length-aware
comparison. The `github` formatter emits native GitHub Actions annotations.
Raw finding totals are not comparable across documents of different lengths.

Machine-readable consumers can use the versioned
[JSON output schema](https://slopsift.dev/schemas/slopsift-result-v1.schema.json)
and [rule catalogue](https://slopsift.dev/rules/index.json). Both also ship in
the npm package as `slopsift/schema/result-v1.json` and `slopsift/rules`.

Use `--exit-zero` for report-only pipelines: lint findings remain visible but do
not fail the command. Configuration and runtime failures still exit `2`.
Unmatched patterns fail with `2` by default so a typo cannot silently pass CI;
`--no-error-on-unmatched-pattern` makes deliberately optional globs exit `0`.
Per-file runtime failures are included in structured output as
`slopsift/runtime-error`; SlopSift continues with the remaining files before it
exits `2`. An explicitly named supported file with no extractable prose receives
an informational `slopsift/no-extractable-prose` diagnostic instead of a silent
zero-word clean result.

SlopSift is not limited to isolated sentences. The parser-backed document model
preserves paragraphs, document-level rules measure repetition and structure,
and independent low-confidence signals can combine into a paragraph-level
warning or error. A single passive or absolute stays informational; a dense
cluster of different tells can become strong evidence of sloppy prose.
The document rules also find repeated dependency frames, arguments restated
without new support, recurring transitions, paragraph templates with the same
cadence, and dense stacks of outcome claims without evidence. Measurements,
sources, examples, mechanisms, polarity changes, and procedural lists act as
negative evidence rather than being treated as more slop.

Markdown and text files are linted as prose. Markdown table cells and rows are
kept as separate parse spans, and any remaining overlength span is chunked
without dropping text. HTML files are linted as rendered text, excluding
metadata, scripts, styles, templates, SVG, and code blocks. Astro files include
visible page copy plus static titles, descriptions, and accessibility labels
while excluding frontmatter and template expressions. JavaScript and TypeScript
include line and block comments plus substantial multiline prose templates,
such as text routes. Other source files extract comments and report findings at
their original locations. Technical comments use a narrower profile that does
not flag diagram symbols as emoji or demand actors for implementation passives.
Generated directories, dependencies, `.git`, and paths in `.gitignore` are
ignored by default.

The compact ~16 MB parser ships in the `writinglint-parser-node` dependency, so
the CLI works offline immediately after installation. Every artifact is checked
against the pinned release manifest before inference. Set `SLOPSIFT_MODEL` or
pass `--model` to override it; the versioned cache is an emergency fallback.

See [MODEL.md](./MODEL.md) for model provenance, training, evaluation,
quantization, artifact release, licensing boundaries, and the reproducibility
runbook.

SlopSift's source code is MIT licensed. The ONNX graphs bundled by its
`writinglint-parser-node` dependency are distributed under CC BY-SA 4.0; the
tokenizer retains its Apache 2.0 lineage. See the parser's
[model license and attribution](https://github.com/NikhilVerma/writinglint/blob/main/packages/parser-node/MODEL_LICENSE.md).

SlopSift has independent versioning and product ergonomics even while developed
in this monorepo. See [RELEASING.md](./RELEASING.md) for its release boundary and
checklist, and [CALIBRATION.md](./CALIBRATION.md) for the real-prose precision
method and current regression results. [AUDIT.md](./AUDIT.md) records the blind
corpus review, newly covered families, and the semantic-model boundary.
