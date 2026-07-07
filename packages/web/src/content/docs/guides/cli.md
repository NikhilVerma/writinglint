---
title: Command line
description: Lint prose from the terminal and score how AI-shaped it reads, with a writinglint.config.ts picked up automatically.
---

The `writinglint` package installs a `writinglint` command. It lints prose against the ai-style
rulepack (by default) and, separately, scores how AI-shaped a document reads.

From inside the repo you can run it via the workspace script:

```bash
npm run cli -- lint README.md
```

## Usage

```bash
writinglint essay.txt              # lint one doc (+ score)
writinglint lint posts/*.md        # lint many docs
writinglint score posts/*.md       # just the AI-style score per doc
cat essay.txt | writinglint        # read from stdin
writinglint --json essay.txt       # machine-readable output
writinglint --quiet posts/*.md     # one summary line per doc
writinglint --config writinglint.config.ts essay.txt
```

Each lint prints its location, rule id, category, and message, followed by an inline colour
reproduction of the text with the flagged spans highlighted — and, at the end, the document's
AI-style score.

## Configuration

Drop a `writinglint.config.ts` in your working directory and the CLI picks it up automatically (or point at one
with `--config`). It's the same `defineConfig` you'd use as a library:

```ts
// writinglint.config.ts
import { defineConfig } from 'writinglint-core';
import { recommended } from 'writinglint-rulepack-ai-style';

export default defineConfig({
  extends: [recommended],
  rules: {
    // Linting Markdown? Silence the format-artifact rules:
    'ai-style/markdown-bold': 'off',
    'ai-style/markdown-heading': 'off',
    'ai-style/emoji': 'off',
    // Promote the construction that started this project to an error:
    'ai-style/corrective-antithesis': 'error',
  },
});
```

With no config file, the CLI falls back to the ai-style `recommended` config (every rule at `warn`).

## Exit code & CI

`--json` emits a structured record per document (score, verdict, and every lint with offsets), which
is what you want in CI or an editor integration. Pipe it to `jq`, gate a commit on it, or feed it to
your own reporter.
