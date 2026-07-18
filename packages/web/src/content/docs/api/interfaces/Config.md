---
editUrl: false
next: false
prev: false
title: "Config"
---

Defined in: [config.ts:13](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/config.ts#L13)

## Properties

### extends?

> `optional` **extends?**: `Config`[]

Defined in: [config.ts:17](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/config.ts#L17)

Preset configs to layer in first; later `extends` and own `rules` win.

***

### plugins?

> `optional` **plugins?**: `Record`\<`string`, [`Rulepack`](/api/interfaces/rulepack/)\>

Defined in: [config.ts:15](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/config.ts#L15)

namespace → rulepack (e.g. { 'ai-style': aiStyle }).

***

### rules?

> `optional` **rules?**: `Record`\<`string`, [`RuleSetting`](/api/type-aliases/rulesetting/)\>

Defined in: [config.ts:19](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/config.ts#L19)

ruleId → setting, e.g. { 'ai-style/rule-of-three': ['warn', { min: 3 }] }.
