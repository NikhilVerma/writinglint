# Repository Guidelines

## Purpose & North Star

WritingLint is the reusable, deterministic prose-linting engine; SlopSift is the focused product built on it. History moved from dependency-graph rules to a SlopSift CLI, local editors, agent-readable contracts, and document analysis.

The North Star is to help people and agents ship intentional, reader-friendly prose using inspectable evidence. SlopSift detects writing habits, not authorship. Treat findings as graded editorial signals: errors are high-confidence, warnings need judgment, and info findings are review candidates. Preserve local processing, exact source ranges, reproducible models, and consistent behavior across CLI, web, editors, CI, and agents. Prefer context, calibration, or demotion over hiding plausible signals to reduce counts.

## Project Structure & Architecture

Packages live under `packages/`. `core` owns the document model, parser contract, rule API, and linter; `parser-node` owns local ONNX inference; `rulepack-*` contains reusable rules. `slopsift` owns file discovery, extraction, confidence defaults, formats, and product ergonomics. Web, Chrome, and VS Code integrations are separate packages. Keep tooling in `scripts/`, tests in each package's `test/`, and research in `experiments/` and `training/`. Reusable behavior belongs in WritingLint rather than a SlopSift interface.

## Build, Test & Development

Use Node 22.14+ and npm 11.5.1+ (`nvm use && npm ci`).

- `npm run dev`: run the WritingLint web app.
- `npm run dev -w slopsift-web`: run SlopSift locally.
- `npm run build:libs`: build publishable libraries and CLIs.
- `npm test`: run `node:test` suites through `tsx`.
- `npm run typecheck`: check all TypeScript projects.
- `npm run check`: verify generated surfaces, types, tests, and library builds.
- `npm run check:push`: pack packages and smoke-test a clean consumer install.

## Code & Test Conventions

Write strict ESM TypeScript with two-space indentation, single quotes, semicolons, explicit type imports, `camelCase` values, `PascalCase` types/components, and kebab-case filenames. Follow adjacent code; no repository-wide formatter is configured. Name tests `*.test.ts` and use `node:test` plus `node:assert/strict`. Rule changes need a triggering fixture and a nearby legitimate case that must not fire. Inspect changed warning/error results in context; parser or model changes also require evaluation, provenance, and runtime evidence.

## Commits & Pull Requests

Use the established `feat:`, `fix:`, or `chore:` commit style. Keep changes focused. PRs should explain intent, user-visible behavior, checks run, and API/model implications; include screenshots for UI changes. Add `npm run changeset` for user-visible published-package changes. Never commit credentials, private corpora, caches, or unauditable third-party artifacts; report vulnerabilities through `SECURITY.md`.
