---
editUrl: false
next: false
prev: false
title: "Config"
---

Defined in: [config.ts:14](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/config.ts#L14)

## Properties

### extends?

> `optional` **extends?**: `Config`[]

Defined in: [config.ts:18](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/config.ts#L18)

Preset configs to layer in first; later `extends` and own `rules` win.

***

### minimumSeverity?

> `optional` **minimumSeverity?**: [`ActiveSeverity`](/api/type-aliases/activeseverity/)

Defined in: [config.ts:22](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/config.ts#L22)

Lowest emitted severity. Later configs override extended configs.

***

### plugins?

> `optional` **plugins?**: `Record`\<`string`, [`Rulepack`](/api/interfaces/rulepack/)\>

Defined in: [config.ts:16](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/config.ts#L16)

namespace → rulepack (e.g. { 'ai-style': aiStyle }).

***

### rules?

> `optional` **rules?**: `Record`\<`string`, [`RuleSetting`](/api/type-aliases/rulesetting/)\>

Defined in: [config.ts:20](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/config.ts#L20)

ruleId → setting, e.g. { 'ai-style/rule-of-three': ['warn', { min: 3 }] }.
