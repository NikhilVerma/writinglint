---
name: slopsift
description: Lint prose with the SlopSift CLI and interpret its structural AI-writing findings without guessing authorship. Use when reviewing or editing Markdown, documentation, website copy, release notes, plain text, or source-code comments for canned arguments, vague attribution, unsupported certainty, repetitive structure, AI vocabulary, hard-to-follow sentences, and related writing tells.
license: MIT
compatibility: Requires Node.js 24 or newer, or Bun, plus permission to run the public slopsift package in the target workspace.
---

# SlopSift

Use the real SlopSift CLI to find writing tells, then apply editorial judgment. Preserve the writer's meaning and voice. Do not describe a finding as proof that AI wrote the text.

## Lint files

Run SlopSift from the repository root. Match the runner to the existing environment:

- Bun repository: `bunx slopsift@latest`.
- Node/npm repository: `npx slopsift@latest`.
- An explicit user choice overrides lockfile inference. Do not install another runtime or switch package managers for the lint run.

Use `@latest` even when SlopSift is installed globally, because a plain `bunx slopsift` runs that global copy, however old it is. If the repository pins its own SlopSift version, use that version instead.

Run both rulepacks unless the user asks for one. `ai-style` looks for AI writing tells. `reader-first` looks for sentences that are hard to follow. The CLI only runs `ai-style` by default, so name both.

Quote globs so SlopSift, rather than the shell, expands them.

```bash
bunx slopsift@latest . --rulepack ai-style --rulepack reader-first --level info
bunx slopsift@latest "docs/**/*.md" --rulepack ai-style --rulepack reader-first --level info
npx slopsift@latest "src/**/*.{ts,tsx}" --rulepack ai-style --rulepack reader-first --level info
```

Prefer the default text output, or `--format compact` for a shorter summary, because it's easier to read. There's no Markdown format.

Use JSON only when you're doing analysis, such as counting or comparing results in a script. Keep the same runtime choice:

```bash
bunx slopsift@latest . --rulepack ai-style --rulepack reader-first --level info --format json --exit-zero
```

Do not add `--exit-zero` when the user wants SlopSift to act as a gate.

The public rule catalogue is at <https://slopsift.dev/rules/>. Structured
consumers can use <https://slopsift.dev/rules/index.json> and the versioned
output schema at
<https://slopsift.dev/schemas/slopsift-result-v1.schema.json>.

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
