# Releasing SlopSift

SlopSift has its own release lifecycle even while it is developed in the
WritingLint monorepo. A WritingLint engine change does not automatically require
a SlopSift release, and a SlopSift UX release does not require renaming or
republishing the engine.

The public npm package and executable are both named `slopsift`. Keep them
identical so the zero-install command remains `bunx slopsift .` without
`--package` indirection.

## Dependency order

When SlopSift needs unreleased engine work, publish in this order:

1. `writinglint-core`
2. `writinglint-parser-node`
3. `writinglint-rulepack-ai-style`
4. `slopsift`

Pin SlopSift to the released engine versions before publishing. Test the packed
tarball in an empty directory so workspace symlinks cannot hide missing files.

## Release checklist

1. Run `npm run typecheck` and `npm test` at the repository root.
2. Run `npm run build -w slopsift`.
3. Run `npm pack --dry-run -w slopsift` and inspect every included file.
4. Test `slopsift .`, a quoted glob, `--format json`, `--format json-lines`,
   `.gitignore`, a Markdown file, and comments in at least two source languages.
5. Install the packed tarballs in a clean temporary project and confirm the
   parser resolves from `writinglint-parser-node/model` with networking blocked.
6. Test `--model`, the emergency R2/cache fallback, and `--no-download`.
7. Verify exit codes 0 (clean), 1 (lint findings), and 2 (runtime/configuration).
8. Update `README.md`, `MODEL.md`, the changelog, and the package version.
9. Publish with provenance from SlopSift's release workflow.
10. Run `bunx slopsift@<version> --version` and `bunx slopsift@<version> .` in
    an empty consumer project.

`npm run smoke:packed` automates the pre-publish isolated tarball test.
`npm run smoke:published` installs the exact package version from the public
registry into a new temporary project and is the final trusted-publish check.
The human-readable fixture lives in `examples/slopsift-npm-smoke` and is not a
member of the repository workspace.

## Product boundary

SlopSift owns its CLI ergonomics, configuration schema, JSON contract, model
release selection, website, documentation, changelog, issue tracker, and brand.
It consumes public WritingLint packages. Do not reintroduce SlopSift as an alias
or environment-controlled mode inside the general `writinglint` CLI.
