---
title: Command line
description: Lint prose from the terminal and score how AI-shaped it reads, with a writinglint.config.ts picked up automatically.
---

The [`writinglint`](https://www.npmjs.com/package/writinglint) package installs a `writinglint`
command. It lints prose against the ai-style rulepack (by default) and, separately, scores how
AI-shaped a document reads.

## Install

```bash
npm install -g writinglint
# the parser needs the model once (~145 MB):
npx nlpgraph download --model xsmall --dir ./models
```

Or run it without installing: `npx writinglint essay.txt`. Working inside this repo instead? Use
the workspace script — `npm run cli -- lint README.md`.

## Usage

```bash
writinglint essay.txt              # lint one doc (+ score)
writinglint lint posts/*.md        # lint many docs
writinglint score posts/*.md       # just the AI-style score per doc
cat essay.txt | writinglint        # read from stdin
writinglint --json essay.txt       # machine-readable output
writinglint --quiet posts/*.md     # one summary line per doc
writinglint --config writinglint.config.ts essay.txt
writinglint --model ./models/xsmall essay.txt   # where the parser model lives
```

The parser model is found automatically at `./models/xsmall` in the working directory (where
`nlpgraph download --dir ./models` puts it); override with `--model <dir>` or `NLPGRAPH_MODEL_DIR`.

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
    // Writing casual prose? Silence the emoji rule:
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
