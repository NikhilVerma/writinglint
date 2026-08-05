# Run SlopSift in GitHub Actions

SlopSift can block high-confidence writing tells, upload an advisory report, or lint only changed prose. The examples below pin the public npm release and require no repository secret.

## Block on high-confidence findings

```yaml
name: SlopSift

on:
  pull_request:
    paths:
      - "**/*.md"
      - "**/*.mdx"
      - "**/*.txt"

permissions:
  contents: read

jobs:
  lint-writing:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Lint high-confidence writing tells
        run: npx --yes slopsift@0.3.1 . --quiet --format github
```

`--quiet` reports errors only. The `github` formatter emits native workflow annotations at the exact source range.

## Upload an advisory report

```yaml
name: SlopSift report

on:
  pull_request:

permissions:
  contents: read

jobs:
  review-writing:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Write a JSON Lines report
        run: npx --yes slopsift@0.3.1 . --level info --format json-lines --exit-zero > slopsift.jsonl
      - uses: actions/upload-artifact@v4
        with:
          name: slopsift-report
          path: slopsift.jsonl
```

`--exit-zero` preserves status 2 for invalid arguments, unmatched required patterns, model failures, and runtime failures. Do not replace it with `|| true`, which hides broken runs.

## Lint changed files only

```yaml
- name: Lint changed writing
  shell: bash
  env:
    BASE_SHA: ${{ github.event.pull_request.base.sha }}
  run: |
    mapfile -d '' files < <(
      git diff --name-only -z --diff-filter=ACMR "$BASE_SHA" HEAD -- \
        "*.md" "*.mdx" "*.txt" "*.html" "*.ts" "*.tsx" "*.js" "*.jsx"
    )
    if (( ${#files[@]} )); then
      npx --yes slopsift@0.3.1 "${files[@]}" --quiet --format github
    fi
```

The null-delimited array preserves spaces in filenames. The command is skipped when no supported files changed.

## Exit codes

- `0`: accepted result, including findings under `--exit-zero`.
- `1`: findings crossed the configured threshold.
- `2`: arguments, file discovery, model loading, configuration, or runtime failed.

## Fork safety

These workflows need only `contents: read`. They do not use secrets and invoke a pinned public package. If the repository already keeps SlopSift as a development dependency, use the committed lockfile, `npm ci`, and `npx slopsift` instead.

## Machine-readable contracts

- [JSON output schema](https://slopsift.dev/schemas/slopsift-result-v1.schema.json)
- [Rule catalogue JSON](https://slopsift.dev/rules/index.json)
- [Rendered guide](https://slopsift.dev/docs/github-actions/)
