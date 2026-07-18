# Releasing Sloplint

Sloplint has its own release lifecycle even while it is developed in the
WritingLint monorepo. A WritingLint engine change does not automatically require
a Sloplint release, and a Sloplint UX release does not require renaming or
republishing the engine.

## Dependency order

When Sloplint needs unreleased engine work, publish in this order:

1. `writinglint-core`
2. `writinglint-parser-node`
3. `writinglint-rulepack-ai-style`
4. `sloplint`

Pin Sloplint to the released engine versions before publishing. Test the packed
tarball in an empty directory so workspace symlinks cannot hide missing files.

## Release checklist

1. Run `npm run typecheck` and `npm test` at the repository root.
2. Run `npm run build -w sloplint`.
3. Run `npm pack --dry-run -w sloplint` and inspect every included file.
4. Test `sloplint .`, a quoted glob, `--format json`, `--format json-lines`,
   `.gitignore`, a Markdown file, and comments in at least two source languages.
5. Test a clean first-run model download with an empty `XDG_CACHE_HOME`.
6. Test an offline second run and `--no-download`.
7. Verify exit codes 0 (clean), 1 (lint findings), and 2 (runtime/configuration).
8. Update `README.md`, `MODEL.md`, the changelog, and the package version.
9. Publish with provenance from Sloplint's release workflow.
10. Run `bunx sloplint@<version> --version` and `bunx sloplint@<version> .` in
    an empty consumer project.

## Product boundary

Sloplint owns its CLI ergonomics, configuration schema, JSON contract, model
release selection, website, documentation, changelog, issue tracker, and brand.
It consumes public WritingLint packages. Do not reintroduce Sloplint as an alias
or environment-controlled mode inside the general `writinglint` CLI.
