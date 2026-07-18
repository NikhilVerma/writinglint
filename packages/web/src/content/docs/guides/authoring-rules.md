---
title: Author a rule
description: Write your own prose rule with the ESLint-style defineRule API — matching over the dependency graph, not just words.
---

A rule is a small object: `meta` describing it, and `create(ctx)` returning a **listener**. The engine
walks each document once — `Document`, then every `Sentence` (with its dependency graph), then every
`Token` — and calls the listeners you subscribed to. Your rule flags spans with `ctx.report(...)`.

This is the capability no other prose linter has: a listener can match on **head/child relations and
dependency labels**, not just a linear stream of words or POS tags.

## A lexical rule (the easy case)

The `Token` listener receives a lexical `Tok` — `{ text, lower, upos, start, end }` with global char
offsets. Match on `t.lower` and report a `span`:

```ts
import { defineRule } from 'writinglint-core';

export const noUtilize = defineRule({
  meta: {
    name: 'no-utilize',
    category: 'clarity',
    docs: { description: 'Prefer “use” over “utilize”.' },
  },
  create(ctx) {
    return {
      Token(t) {
        if (t.lower === 'utilize' || t.lower === 'utilise') {
          ctx.report({ span: { start: t.start, end: t.end }, message: 'Prefer “use”.' });
        }
      },
    };
  },
});
```

## A structural rule (the point of WritingLint)

Match over the graph. Here we flag a **coordinated "X, not Y" contrast** — a `conj`/`appos` dependent
whose coordinator is the word *not*. One rule catches "clarity, not cleverness" **and** "the graph,
not the vibes", and it survives rewording — impossible with a word list.

```ts
import { defineRule, byId, childrenOf, lower, subtree } from 'writinglint-core';

export const correctiveAntithesis = defineRule({
  meta: {
    name: 'corrective-antithesis',
    category: 'parallelism',
    docs: { description: 'The “X, not Y” staged contrast.' },
  },
  create(ctx) {
    return {
      Sentence(sentence) {
        const s = sentence.dep;
        for (const y of s.tokens) {
          if (y.deprel !== 'conj' && y.deprel !== 'appos') continue;          // Y coordinated with X
          const not = childrenOf(s, y.id).find((c) => lower(c) === 'not');    // coordinator is "not"
          if (!not) continue;
          const before = byId(s, not.id - 1);                                 // guard: the ", not" comma
          if (!before || before.form !== ',') continue;
          const head = byId(s, y.head);
          ctx.report({ tokens: subtree(s, (head ?? y).id), sentence: s, message: 'Corrective antithesis (“X, not Y”).' });
        }
      },
    };
  },
});
```

Graph helpers re-exported from `writinglint-core` for exactly this: `childrenOf`, `childrenByRel`,
`child`, `hasChild`, `byId`, `root`, `subtree`, `spanOf`, `isGerund`, `lower`.

## Locating a report

Give `ctx.report` a location as either explicit char offsets or tokens:

- `{ span: { start, end } }` — direct char offsets into the text.
- `{ tokens, sentence }` — token(s) plus the sentence they came from; the engine resolves their byte
  offsets to a global char span for you.

Message as a literal `message`, or a `messageId` into `meta.messages` with `data` for
`{{placeholder}}` interpolation.

## Bundle rules into a pack

A **rulepack** is the unit of distribution: rules keyed by short name, category metadata, and preset
configs. Register it in a config under a namespace via `plugins`, then enable its rules.

```ts
import { definePack, defineConfig } from 'writinglint-core';

export const house = definePack({
  name: 'house',
  categories: { clarity: { id: 'clarity', label: 'Clarity', blurb: 'Plain, direct phrasing.' } },
  rules: { 'no-utilize': noUtilize, 'corrective-antithesis': correctiveAntithesis },
});

export const houseRecommended = defineConfig({
  plugins: { house },
  rules: { 'house/no-utilize': 'warn', 'house/corrective-antithesis': 'error' },
});
```

Now `linter.lint(text, houseRecommended)` runs your pack. That's the whole extension model — the same
one `writinglint-rulepack-ai-style` uses.
