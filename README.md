# WritingLint

**A grammar linter for prose — like ESLint, but its rules match over a real
dependency-parse + POS graph.**

[![writinglint](https://img.shields.io/npm/v/writinglint?label=writinglint&color=2563eb)](https://www.npmjs.com/package/writinglint)
[![writinglint-core](https://img.shields.io/npm/v/writinglint-core?label=writinglint-core&color=2563eb)](https://www.npmjs.com/package/writinglint-core)
[![license](https://img.shields.io/npm/l/writinglint-core)](LICENSE)
[![demo](https://img.shields.io/badge/demo-live-2563eb)](https://writinglint.nikhilv.workers.dev)

WritingLint lints writing the way ESLint lints code: a small engine parses your
text once, runs a set of **authorable rules** over it, and reports each problem
with a location and a plain-language message. Rules are ordinary TypeScript that
match on the **dependency graph** of each sentence — head/child/`deprel` shapes,
not just word lists or linear token patterns — so *any* words can fill a
construction's slots and still be caught.

"AI-writing style" is just the **first rulepack**. The architecture is a general
prose linter you can build on: write your own rules, ship your own rulepacks,
and (soon) plug it into an editor over LSP.

## Install

On npm (unscoped — no org needed):
[`writinglint`](https://www.npmjs.com/package/writinglint) (CLI) ·
[`writinglint-core`](https://www.npmjs.com/package/writinglint-core) ·
[`writinglint-parser-node`](https://www.npmjs.com/package/writinglint-parser-node) ·
[`writinglint-rulepack-ai-style`](https://www.npmjs.com/package/writinglint-rulepack-ai-style)

```bash
# current local build (Stanza reference backend)
npm install
npm run setup-stanza
npm run cli -- essay.txt
npm run sloplint -- . --json
```

A runnable consumer lives in [`examples/node-lint`](examples/node-lint).

## Why a dependency graph

The prose-linter landscape already has good tools — but none match on syntax:

| Tool | Rules are… | Syntax layer |
|---|---|---|
| [textlint](https://textlint.org) | TS/JS code (pluggable) | ❌ text/markdown AST — regex fallback for structure |
| [Vale](https://vale.sh) | YAML patterns | ❌ markup-aware, not syntax-aware |
| [proselint](https://github.com/amperser/proselint) | fixed Python rules | ❌ |
| [Harper](https://github.com/automattic/harper) | Rust + **Weir** DSL | ✅ POS + token sequences, ❌ **no dependency relations** |
| **WritingLint** | **TS code** | ✅ **full dependency graph (head/child/`deprel`)** |

Harper's Weir is authorable and POS-aware — but it's linear token/POS matching
only. The one thing no incumbent can express is a **dependency relation**, and
that's exactly what the hard constructions need. The flagship example:

> *"Trust the flags, not the number."* — **corrective antithesis** ("X, not Y")

That's a `conj`/`appos` dependent whose coordinator is the negator *"not"* — a
head/child relation. A linear DSL can't tell it apart from ordinary negation
(*"I did not see the number"*) without over-firing. A dependency rule can:

```ts
// packages/rulepack-ai-style/src/rules/corrective-antithesis.ts
export const correctiveAntithesis = defineRule({
  meta: { name: 'corrective-antithesis', category: 'parallelism', docs: { … } },
  create(ctx) {
    return {
      Sentence(sentence) {
        const s = sentence.dep;                       // the dependency graph
        for (const y of s.tokens) {
          if (y.deprel !== 'conj' && y.deprel !== 'appos') continue;
          const not = childrenOf(s, y.id).find((c) => lower(c) === 'not');
          if (!not) continue;
          if (byId(s, not.id - 1)?.form !== ',') continue;   // the ", not" comma
          ctx.report({ tokens: subtree(s, y.head), sentence: s, message: … });
        }
      },
    };
  },
});
```

## Architecture

A workspaces monorepo. The engine knows nothing about AI writing; the rules live
in a pack that plugs in.

```
packages/
  core/                writinglint-core
    document.ts        parse-once Document model over the dependency graph
    graph.ts           dependency helpers (child, subtree, spanOf …) for rule authors
    rule.ts            the authorable Rule API (defineRule, RuleContext, Lint)
    pack.ts            Rulepack + categories (definePack)
    config.ts          defineConfig / resolveConfig (extends, plugins, rules)
    linter.ts          Linter.lint(): parse → run rules → deduped, sorted lints
  parser-node/         writinglint-parser-node — persistent local Stanza adapter
  rulepack-ai-style/   writinglint-rulepack-ai-style — the first rulepack
    rules/*.ts         16 rules (structural on the graph; lexical on words/chars)
    score/             the stylometric AI-style SCORE (separate from the lints)
    model/             classifier.json — data-free weights, shipped
    eval/              training + honest evaluation (data is private, gitignored)
  cli/                 general-purpose `writinglint` engine CLI
  sloplint/            independent AI-slop CLI product and engine consumer
  web/                 browser editor; local dev calls the Stanza bridge
```

Two independent outputs, deliberately decoupled:

1. **Lints** — each rule flags a specific construction with a location + message.
   This is the linter proper; authorable, configurable, per-rule.
2. **Score** — a stylometric classifier rates how AI-shaped the whole document
   reads (0–100). *Not* a rule — a text can score low with a few flags, or high
   with none. Shipped in the ai-style pack as `score(doc, lints, model)`.

## Authoring a rule

A rule is a `meta` block plus `create(ctx)` returning a listener the engine
visits once per document: `Document(doc)`, `Sentence(s)` (with `s.dep`, the
graph), and `Token(t)`. Report a problem with `ctx.report({ tokens | span, … })`.
The dependency-graph toolkit (`childrenOf`, `child`, `childrenByRel`, `subtree`,
`spanOf`, `hasChild`, `lower`, …) is exported from `writinglint-core`.

## Config

`defineConfig` layers rulepacks and rule settings (ESLint-flat-config style;
Harper's Weir "base pack + override layer" is the same idea). A `writinglint.config.ts` in
the working directory is picked up automatically by the CLI:

```ts
import { defineConfig } from 'writinglint-core';
import { recommended } from 'writinglint-rulepack-ai-style';

export default defineConfig({
  extends: [recommended],
  rules: {
    'ai-style/corrective-antithesis': 'error',
    'ai-style/emoji': 'off',                // casual prose? silence the emoji tell
  },
  // plugins: { house: myRulepack },        // register your own rules
});
```

## The ai-style rulepack

Its structural rules match Wikipedia's
[**Signs of AI writing**](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)
as *constructions* in the parse — word-agnostic:

| Sign (a "hollow" construction) | dependency signature |
|---|---|
| **Corrective antithesis** ("X, not Y") | `conj`/`appos` dependent coordinated by "not" |
| **Copula avoidance** ("X stands as a testament…") | non-`be` root verb + `obl` noun with `case`="as" |
| **Vague attribution** ("Experts argue that…") | bare (no-`det`) common-noun `nsubj` + saying-verb + `ccomp` |
| **Participial appendage** ("…, showcasing its value") | trailing `advcl` gerund after the main clause |
| **Negative parallelism** ("not only X but also Y") | `conj` with `cc`="but" + "only/also" markers |
| **Rule of three** ("bustling, vibrant, and diverse") | ADJ/ADV head with ≥2 `conj` children |
| **Light-verb inflation** ("plays a pivotal role") | play/occupy + `obj`=role + `amod` adjective |

Where a slot is irreducibly *semantic* (a parser can't tell an *importance*
adjective from any adjective), a **small closed seed** narrows it — but the
structure always comes from the parse. Inherently lexical signs (the "AI
vocabulary" list; em-dash / curly-quote / markdown / emoji formatting) stay lists
*by nature*, split into individually-toggleable rules.

### The score (SOTA with POS + graph)

We follow the literature and extend it:

- **Base — dependency-relation n-gram TF-IDF → a linear classifier** (the shape
  recent structural AI-text detectors converge on).
- **Extensions:** + POS (UPOS) n-grams; + interpretable **stylometric scalars**
  (burstiness, type-token ratio, copula ratio, POS/deprel ratios, mean dependency
  distance, tree depth…); + our **hollowness-rule rates** (which also make the
  score explainable).
- **Model:** an L2-regularised logistic regression (deterministic, calibrated).
  It serialises to a **data-free** JSON
  (`packages/rulepack-ai-style/model/classifier.json`, vocabulary + weights only),
  so the model ships open-source while the training data stays closed.

True SOTA overall is neural/perplexity-based (fine-tuned DeBERTa; Binoculars), but
that needs an LLM at runtime and generalises poorly under paraphrase. This is the
strongest *offline, deterministic, no-LLM* score we can build.

## Evaluation

Measured with a **maker≠checker** discipline (`packages/rulepack-ai-style/eval/`),
and with the two rules this project learned the hard way:

1. **We never author the data.** The tool is an AI; any text *it* writes is AI
   text. Early on, maintainer-written "human-voice" samples poisoned the human
   class — the classifier correctly flagged them, which is *how we found the bug*.
   Human data must be **real, fetched** writing; AI data must be **real model
   output**.
2. **Don't trust a number from one distribution.** An early model scored
   **AUC 0.997** on same-distribution held-out — then **0.65** on varied data. It
   had learned *one narrow stylistic slice vs everything else*, and flagged
   out-of-slice human writing as AI. The fix was a **diverse** training pool.

The training pool spans **real human** writing across many authors and eras and
**real AI** output from many model families; a stratified blind slice is held out
and never trained on.

| eval | ROC-AUC | F1 | precision | recall | specificity |
|---|---|---|---|---|---|
| 5-fold CV (diverse pool) | 0.879 | 0.834 | 0.813 | 0.856 | 0.799 |
| **blind test** (held-out slice) | **0.899** | 0.833 | 0.786 | 0.887 | 0.754 |
| OOD probe (out-of-distribution) | 0.923 | 0.811 | 0.789 | 0.833 | 0.778 |

**AUC ~0.90 that holds across CV, a blind slice, *and* out-of-distribution.** The
classifier lifts subtle-AI recall from **33% (rules alone) → ~89%**.

**Honest limitations.** (a) Specificity ~0.75 is the weak spot — clean *modern*
human prose still trips it. (b) Cross-source generalisation is untested. (c)
Highlight offsets are exact document-global UTF-16 ranges.

> **⚠ Eval data is CLOSED-SOURCE / private.** It contains third-party text, so
> `eval/data/` is **gitignored** and never enters this repo. The code, the trained
> model (data-free), and the metrics are open source; only the corpus is private,
> documented privately alongside it. `npm run train` / `npm run eval` degrade
> gracefully with a pointer if the data isn't present.

## Getting started

```bash
npm install
npm run setup-stanza     # isolated Python 3.12 env + English UD models
npm run typecheck        # tsc across all packages
npm test                 # core engine + rulepack rule tests
npm run train            # fit + GUARDED honest eval (needs private eval data)
```

### CLI

```bash
npm run cli -- essay.txt              # lint one doc (+ AI-style score)
npm run cli -- lint posts/*.md        # lint many docs
npm run cli -- score posts/*.md       # just the score per doc
cat essay.txt | npm run cli           # stdin
npm run cli -- --json essay.txt       # machine-readable
npm run sloplint -- . --json          # exits 1 while AI-slop lints remain
```

A `writinglint.config.ts` in the working directory is used automatically; otherwise the
ai-style `recommended` config applies.

### Web app

A Hemingway-style editor that highlights constructions as you type. The compact
INT8 dependency parser runs through ONNX Runtime WASM in a web worker; text never
leaves the device.

```bash
npm run dev              # browser parser + client bundle + Astro dev server
```

## Deployment status

The hosted demo uses the owned TypeScript tokenizer and decoder with the compact
INT8 ONNX model. Production serves the site through Cloudflare Workers Static
Assets and streams the gitignored model/runtime files from R2.

## Roadmap

1. ✅ Grammar-linter engine — authorable rules over a dependency graph.
2. ✅ ai-style rulepack (16 rules) + stylometric score, evaluated on diverse data.
3. ✅ Python-free CLI + deployable browser editor using the owned ONNX parser.
4. **VSCode extension / LSP** (`packages/lsp`, `packages/vscode`) — lint in the editor.
5. **More rulepacks** — grammar, clarity, house-style; richer user-rule authoring.
6. Lift specificity on modern human prose; per-lint autofixes; cross-source eval.

## Credits

- Reference parser: [Stanza](https://stanfordnlp.github.io/stanza/) (Apache 2.0).
- ai-style taxonomy: Wikipedia, *[Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)* (CC BY-SA).
- Method: dependency-relation + POS features for structural AI-text detection.
- Prior art in prose linting: [textlint](https://textlint.org), [Vale](https://vale.sh), [proselint](https://github.com/amperser/proselint), [Harper](https://github.com/automattic/harper).

## License

MIT (code + model). Eval data is not distributed.
