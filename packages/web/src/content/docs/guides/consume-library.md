---
title: Consume as a library
description: Use the WritingLint engine in your own tool — parse once, lint against a config, and read back structured problems.
---

WritingLint is a library first, a demo second. The engine lives in
[`writinglint-core`](https://www.npmjs.com/package/writinglint-core); the parser loader for Node is
[`writinglint-parser-node`](https://www.npmjs.com/package/writinglint-parser-node); the AI-writing
rules and scorer are in
[`writinglint-rulepack-ai-style`](https://www.npmjs.com/package/writinglint-rulepack-ai-style).

## Install

```bash
npm install writinglint-core writinglint-parser-node writinglint-rulepack-ai-style
# in this repository: npm run setup-stanza
```

A runnable version of everything below is in
[`examples/node-lint`](https://github.com/NikhilVerma/writinglint/tree/main/examples/node-lint).

## Lint some text

`new Linter(parser).lint(text, config)` parses the text **once** and runs every enabled rule in a
single walk. It returns the document, the flat list of `Lint`s, and the category metadata for the
rules that ran.

```ts
import { Linter } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { recommended } from 'writinglint-rulepack-ai-style';

const linter = new Linter(await loadParser());

const { lints } = await linter.lint(
  "It's not just a linter, it's a paradigm shift.",
  recommended,
);

for (const l of lints) {
  console.log(`${l.ruleId}  [${l.category}]  ${l.start}-${l.end}  ${l.message}`);
  // ai-style/corrective-antithesis  [parallelism]  8-46  Corrective antithesis …
}
```

Each `Lint` carries everything a UI needs: `ruleId`, `category`, `severity`, the `start`/`end` **char
offsets** into the original text, the exact `text` flagged, and a plain-language `message` (plus an
optional `fix`/`suggestion`).

## Pick and tune rules

`recommended` turns on every AI-style rule in confidence-aware `auto` mode and emits medium/high
confidence findings. Use `strict` to include low-confidence information or `ci` for high-confidence
errors only. To narrow or retune, build a config with
`defineConfig` — ESLint-flat-config style: `extends` pulls in presets, `rules` overrides
(`'off' | 'warn' | 'error'`).

```ts
import { defineConfig } from 'writinglint-core';
import { recommended } from 'writinglint-rulepack-ai-style';

const config = defineConfig({
  extends: [recommended],
  rules: {
    'ai-style/emoji': 'off',                // casual prose — emoji are normal there
    'ai-style/corrective-antithesis': 'error',
  },
});

const { lints } = await linter.lint(text, config);
```

## Score how AI-shaped it reads (optional)

The stylometric score is **separate from the lints** by design — it's a document-level metric, not a
rule. Load the shipped, data-free model and call `score(doc, lints, model)`:

```ts
import { score } from 'writinglint-rulepack-ai-style';
import { loadModelNode } from 'writinglint-rulepack-ai-style/node';

const model = await loadModelNode();
const { doc, lints } = await linter.lint(text, recommended);
const { score: s, verdict } = score(doc, lints, model);
console.log(`${s}/100 — reads as ${verdict}`);
```

## In the browser

The engine is isomorphic because it accepts any implementation of the owned `Parser` contract.
This site's demo runs the owned compact parser through ONNX Runtime WASM in a web worker. Model
download, tokenization, parsing, valid-tree decoding, rules, and scoring all stay on the device.
