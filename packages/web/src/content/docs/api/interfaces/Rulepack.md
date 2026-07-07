---
editUrl: false
next: false
prev: false
title: "Rulepack"
---

Defined in: [pack.ts:20](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/pack.ts#L20)

## Properties

### categories?

> `optional` **categories?**: `Record`\<`string`, [`Category`](/api/interfaces/category/)\>

Defined in: [pack.ts:30](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/pack.ts#L30)

Category metadata keyed by category id.

***

### configs?

> `optional` **configs?**: `Record`\<`string`, [`Config`](/api/interfaces/config/)\>

Defined in: [pack.ts:32](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/pack.ts#L32)

Named preset configs consumers can `extends`, e.g. `configs.recommended`.

***

### name

> **name**: `string`

Defined in: [pack.ts:22](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/pack.ts#L22)

Namespace used to reference this pack's rules, e.g. 'ai-style'.

***

### rules

> **rules**: `Record`\<`string`, [`Rule`](/api/interfaces/rule/)\<`any`\>\>

Defined in: [pack.ts:28](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/pack.ts#L28)

Rules keyed by their short name (the part after 'name/'). Stored as
`Rule<any>` because a pack holds rules with heterogeneous Options types;
each rule keeps its own typing at the `defineRule` call site.
