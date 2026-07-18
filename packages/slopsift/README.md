# SlopSift

An opinionated CLI that flags AI-writing slop in prose and source-code comments.
It is a separate product built on the WritingLint engine and AI-style rulepack.

```bash
bunx slopsift .
bunx slopsift "docs/**/*.md" "src/**/*.{ts,tsx}"
bunx slopsift . --format json
bunx slopsift . --level info
bunx slopsift . --exit-zero
```

The `slopsift` package and executable deliberately share a name, so both
`bunx slopsift .` and `npx slopsift .` work without a package override. CI
installs its packed tarball into an isolated non-workspace project before every
release and repeats the smoke test against the public registry afterward.

SlopSift grades every finding by detector confidence:

- `error` / high confidence: a strong, specific slop signature; exits non-zero.
- `warning` / medium confidence: likely slop that still needs editorial judgment.
- `info` / low confidence: a possible signal to review; never fails a run by itself.

The default `--level warning` reports errors and warnings. Use `--level info` for
the strict editorial view, `--level error` (or `--quiet`) for high-confidence CI,
and `--max-warnings 0` when warnings should fail CI. JSON format uses ESLint's
numeric severities (`2`, `1`, `0`), retains `level` plus `confidence`, and adds
`wordCount` plus `findingsPerThousandWords` for length-aware comparison. Raw
finding totals are not comparable across documents of different lengths.

Use `--exit-zero` for report-only pipelines: lint findings remain visible but do
not fail the command. Configuration and runtime failures still exit `2`.
Unmatched patterns fail with `2` by default so a typo cannot silently pass CI;
`--no-error-on-unmatched-pattern` makes deliberately optional globs exit `0`.

SlopSift is not limited to isolated sentences. The parser-backed document model
preserves paragraphs, document-level rules measure repetition and structure,
and independent low-confidence signals can combine into a paragraph-level
warning or error. A single passive or absolute stays informational; a dense
cluster of different tells can become strong evidence of sloppy prose.

Markdown and text files are linted as prose. HTML files are linted as rendered
text, excluding metadata, scripts, styles, templates, SVG, and code blocks. In
source files, SlopSift extracts line and block comments and reports findings at
their original file locations. Technical comments use a narrower profile that
does not flag diagram symbols as emoji or demand actors for implementation
passives.
Generated directories, dependencies, `.git`, and paths in `.gitignore` are
ignored by default.

The compact ~16 MB parser ships in the `writinglint-parser-node` dependency, so
the CLI works offline immediately after installation. Every artifact is checked
against the pinned release manifest before inference. Set `SLOPSIFT_MODEL` or
pass `--model` to override it; the versioned cache is an emergency fallback.

See [MODEL.md](./MODEL.md) for model provenance, training, evaluation,
quantization, artifact release, licensing boundaries, and the reproducibility
runbook.

SlopSift has independent versioning and product ergonomics even while developed
in this monorepo. See [RELEASING.md](./RELEASING.md) for its release boundary and
checklist, and [CALIBRATION.md](./CALIBRATION.md) for the real-prose precision
method and current regression results. [AUDIT.md](./AUDIT.md) records the blind
corpus review, newly covered families, and the semantic-model boundary.
