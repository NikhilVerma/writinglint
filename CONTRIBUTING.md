# Contributing to WritingLint and SlopSift

Thanks for helping improve the prose-linting engine, SlopSift, or one of the
editor integrations. Small, focused changes are easiest to review.

## Before you start

- Search existing issues before opening a new one.
- For substantial behavior, parser, rule-severity, or public-API changes, open
  a proposal issue first. This prevents two people from solving the same
  problem in incompatible ways.
- Never add non-public code, models, generated output, fixtures, documentation,
  or other third-party intellectual property. Parser and model work must have
  independently auditable provenance.
- Do not commit private evaluation corpora, local model caches, credentials, or
  audit output containing local file paths.

## Local setup

Use Node.js 22.14 or newer and npm 11.5.1 or newer. The repository includes an
`.nvmrc` for the minimum supported Node release.

```sh
nvm use
npm install --global npm@11.6.1
npm ci
npm run setup-model
npm run check
```

`npm ci` installs the Husky hooks. Before each push, the repository builds the
public tarballs and installs SlopSift in a fresh consumer project. You can run
the same gate directly with `npm run check:push`.

The parser training experiments use `uv`; they are not required for ordinary
TypeScript contributions. See `training/parser/README.md` before changing the
model or training pipeline. Parser changes must pass the documented Ruff,
strict mypy, and Python unit checks before the expensive devbox evaluation.

## Making changes

1. Create a branch from `main`.
2. Add or update focused tests with behavior changes.
3. Run `npm run check`.
4. Run `npm run check:push` when changing a public package, its manifest, or a
   CLI entry point. The Husky pre-push hook runs it automatically as a final
   package-boundary check.
5. Add a Changeset for a user-visible change to a published package:

   ```sh
   npm run changeset
   ```

   Choose the affected packages, select the SemVer bump, and explain the user
   impact. Documentation, CI, test-only, and unreleased-app changes usually do
   not need a Changeset.

## Rule changes and false positives

Lint rules must explain a specific writing problem and point to a useful source
range. Include both a positive fixture and a nearby legitimate construction
that must not fire. Severity changes need corpus evidence: record what was
sampled, why the result is actionable, and what false-positive boundary was
added. Keep private source text out of commits.

## Pull requests

Keep pull requests scoped and describe:

- the problem and intended behavior;
- tests and manual checks performed;
- user-visible or package/API changes;
- screenshots for UI changes;
- model provenance and evaluation methodology for model changes.

By contributing, you agree that your contributions are licensed under the
repository's [MIT License](LICENSE) and to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

Security vulnerabilities should be reported privately according to
[SECURITY.md](SECURITY.md), not in a public issue.
