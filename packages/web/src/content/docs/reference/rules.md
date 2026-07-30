---
title: The AI-style rulepack
description: Every rule in writinglint-rulepack-ai-style, grouped by category — the structural ones match over the dependency graph.
---

`writinglint-rulepack-ai-style` is the first rulepack. `recommended` enables every rule below in
confidence-aware `auto` mode, reporting medium- and high-confidence findings by default.
`warn`. Rules are namespaced `ai-style/<name>`, so you override any of them in a config, e.g.
`'ai-style/rule-of-three': 'off'`.

The **★ structural** rules match over the dependency graph — the ones a regex or POS-only linter
cannot express. The rest are lexical / idiom / formatting rules.

## Structure & cadence

| Rule | Category | What it catches |
| --- | --- | --- |
| ★ `corrective-antithesis` | parallelism | The "X, not Y" staged contrast ("the graph, not the vibes"). |
| ★ `negative-parallelism` | parallelism | "Not (only) X but (also) Y" — a signature LLM cadence. |
| ★ `copula-avoidance` | significance | "stands/serves as a …" dressing up a plain "is a …". |
| ★ `light-verb-role` | significance | "plays a … role" — importance asserted, not shown. |
| ★ `participial-appendage` | significance | Trailing "-ing" clause that editorialises the main clause. |
| ★ `rule-of-three` | rule-of-three | Reflexive triads of coordinated adjectives or adverbs. |
| ★ `vague-attribution` | vague | A bare, generic subject asserting a "that …" clause ("Studies suggest…"). |
| ★ `throat-clearing` | meta | "It is important to note that …". If it matters, just say it. |
| `hedging-seesaw` | balance | Relentless "While X… However, Y" balancing, density-gated — a position never taken. |
| ★ `comma-splice` | rhythm | Two complete clauses stapled with a bare comma ("Thanks for the demo, I enjoyed it.") — clipped parataxis performing breeziness. |
| ★ `agentless-opener` | agency | "Notes attached, and they are …" — a verbless fragment that circles back with a pronoun instead of naming the doer. |
| ★ `setup-fragment` | performance | "One thing I wanted to put on the table …" — a noun-rooted fragment staging a point instead of making it. |

## Vocabulary & idioms

| Rule | Category | What it catches |
| --- | --- | --- |
| `ai-vocabulary` | ai-vocab | Words LLMs over-use relative to human writers (delve, tapestry, …). |
| `significance-idioms` | significance | Fixed "inflated significance" idioms (rich tapestry, testament to …). |
| `promo-idioms` | promo | Travel-brochure / press-release idioms (nestled in the heart of …). |
| `chatbot-idioms` | meta | Editorialising / chatbot filler ("it's worth noting…"). |
| `opening-conjunction` | conjunctions | Formulaic sentence-opening transitions ("Moreover,", "Ultimately,"). |
| `performed-candor` | performance | Announced honesty ("to be fully transparent", "I'll be honest") in place of the honest sentence itself. |
| ★ `filler-intensifiers` | performance | Sincerity adverbs on first-person stance adjectives ("I am genuinely open"), plus density-gated intensifier spray. |

## Formatting tells

| Rule | Category | What it catches |
| --- | --- | --- |
| `em-dash-overuse` | formatting | Heavy em-dash use relative to sentence count (density-gated — a few em dashes never fire). |
| `mixed-quotes` | formatting | Straight and curly quotes mixed in one document — a paste seam. |
| `generation-artifacts` | formatting | Leftover chatbot citation tokens (`oaicite`, `turn0search0`, `utm_source=chatgpt.com`). |
| `emoji` | formatting | Decorative emoji in formal prose. |

:::note[Why no Markdown or curly-quote rules?]
Markdown syntax (`**bold**`, `#` headings) is not flagged: humans author Markdown all the
time (READMEs, docs, notes), so it carries no AI signal on its own. Curly quotes alone
aren't flagged either — Word, Google Docs, and iOS auto-curl typed quotes; only *mixing*
straight and curly styles carries signal. Writing casual prose where emoji are normal?
Turn that one off: `'ai-style/emoji': 'off'`.
:::

## The score is not a rule

Separately from the lints, the pack ships a **stylometric score** — a document-level 0–100 estimate of
how AI-shaped the writing reads, from a small data-free classifier. It is deliberately **not** a rule:
flags are local and structural; the score is global and statistical. See
[Consume as a library](/guides/consume-library/#score-how-ai-shaped-it-reads-optional).
