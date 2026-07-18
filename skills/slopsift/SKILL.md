---
name: slopsift
description: Lint prose with the SlopSift CLI and interpret its structural AI-writing findings without guessing authorship. Use when reviewing or editing Markdown, documentation, website copy, release notes, plain text, or source-code comments for canned arguments, vague attribution, unsupported certainty, repetitive structure, AI vocabulary, and related writing tells.
---

# SlopSift

Use the real SlopSift CLI to find writing tells, then apply editorial judgment. Preserve the writer's meaning and voice. Do not describe a finding as proof that AI wrote the text.

## Lint files

Run SlopSift from the repository root. Match the runner to the existing environment:

- Bun repository: `bunx slopsift`.
- Node/npm repository: `npx slopsift`.
- An explicit user choice overrides lockfile inference. Do not install another runtime or switch package managers for the lint run.

Quote globs so SlopSift, rather than the shell, expands them.

```bash
bunx slopsift . --level info
bunx slopsift "docs/**/*.md" --level info
npx slopsift "src/**/*.{ts,tsx}" --level info
```

For machine-readable analysis, keep the same runtime choice and use:

```bash
bunx slopsift . --level info --format json --exit-zero
```

Do not add `--exit-zero` when the user wants SlopSift to act as a gate.

## Review findings

Treat levels as editorial priority:

- Fix errors first. They represent narrow, high-confidence signatures.
- Review warnings in context. They need human judgment.
- Treat info findings as weak signals, not mandatory edits. A single em dash, passive, or familiar word can be legitimate.

Read the exact reported range and surrounding sentence before changing anything. For cluster findings, inspect the component rules instead of rewriting from the cluster message alone.

## Edit prose

When the user asks for changes:

1. Keep facts, technical terms, examples, and the writer's register intact.
2. Replace vague claims with concrete actors, evidence, or narrower wording.
3. Remove canned framing only when it adds no meaning.
4. Vary repeated structure without making the prose decorative.
5. Rerun the same command and report what remains.

Do not optimize for zero findings at the expense of natural writing. Explain any intentional findings left in place.

When the user asks only for a review, report findings and suggested directions without rewriting files.

## Lint short text

If the prose is not already in a file, place it in a narrowly scoped temporary `.md` or `.txt` file, lint that file, and remove it afterward when safe. Do not overwrite a user's file merely to run the linter.

## Report the result

Lead with the strongest useful findings. Include the rule name or category, exact triggering text, and a concise revision direction. State that SlopSift reports writing signals rather than authorship.
