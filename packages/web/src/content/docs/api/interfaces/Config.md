---
editUrl: false
next: false
prev: false
title: "Config"
---

Defined in: config.ts:13

## Properties

### extends?

> `optional` **extends?**: `Config`[]

Defined in: config.ts:17

Preset configs to layer in first; later `extends` and own `rules` win.

***

### plugins?

> `optional` **plugins?**: `Record`\<`string`, [`Rulepack`](/api/interfaces/rulepack/)\>

Defined in: config.ts:15

namespace → rulepack (e.g. { 'ai-style': aiStyle }).

***

### rules?

> `optional` **rules?**: `Record`\<`string`, [`RuleSetting`](/api/type-aliases/rulesetting/)\>

Defined in: config.ts:19

ruleId → setting, e.g. { 'ai-style/rule-of-three': ['warn', { min: 3 }] }.
