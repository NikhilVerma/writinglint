# Sloplint

An opinionated CLI that flags AI-writing slop in prose and source-code comments.
It is a separate product built on the WritingLint engine and AI-style rulepack.

```bash
bunx sloplint .
bunx sloplint "docs/**/*.md" "src/**/*.{ts,tsx}"
bunx sloplint . --format json
bunx sloplint . --level info
```

Sloplint grades every finding by detector confidence:

- `error` / high confidence: a strong, specific slop signature; exits non-zero.
- `warning` / medium confidence: likely slop that still needs editorial judgment.
- `info` / low confidence: a possible signal to review; never fails a run by itself.

The default `--level warning` reports errors and warnings. Use `--level info` for
the strict editorial view, `--level error` (or `--quiet`) for high-confidence CI,
and `--max-warnings 0` when warnings should fail CI. JSON format uses ESLint's
numeric severities (`2`, `1`, `0`) and retains `level` plus `confidence` fields.

Sloplint is not limited to isolated sentences. The parser-backed document model
preserves paragraphs, document-level rules measure repetition and structure,
and independent low-confidence signals can combine into a paragraph-level
warning or error. A single passive or absolute stays informational; a dense
cluster of different tells can become strong evidence of sloppy prose.

Markdown and text files are linted as prose. HTML files are linted as rendered
text, excluding metadata, scripts, styles, templates, SVG, and code blocks. In
source files, Sloplint extracts line and block comments and reports findings at
their original file locations. Technical comments use a narrower profile that
does not flag diagram symbols as emoji or demand actors for implementation
passives.
Generated directories, dependencies, `.git`, and paths in `.gitignore` are
ignored by default.

The first run downloads a versioned ~16 MB parser into `~/.cache/sloplint` (or
`$XDG_CACHE_HOME/sloplint`). Later runs are local. Set `SLOPLINT_MODEL` or pass
`--model` for an offline model bundle.

See [MODEL.md](./MODEL.md) for model provenance, training, evaluation,
quantization, artifact release, licensing boundaries, and the reproducibility
runbook.

Sloplint has independent versioning and product ergonomics even while developed
in this monorepo. See [RELEASING.md](./RELEASING.md) for its release boundary and
checklist, and [CALIBRATION.md](./CALIBRATION.md) for the real-prose precision
method and current regression results. [AUDIT.md](./AUDIT.md) records the blind
blog review, newly covered families, and the semantic-model boundary.
