---
editUrl: false
next: false
prev: false
title: "RuleMeta"
---

Defined in: [rule.ts:83](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/rule.ts#L83)

## Properties

### category

> **category**: `string`

Defined in: [rule.ts:87](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/rule.ts#L87)

Category id this rule belongs to (defined by the rulepack).

***

### defaultSeverity?

> `optional` **defaultSeverity?**: [`ActiveSeverity`](/api/type-aliases/activeseverity/)

Defined in: [rule.ts:92](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/rule.ts#L92)

Severity applied when the rule is turned on without an explicit level.

***

### docs

> **docs**: `object`

Defined in: [rule.ts:88](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/rule.ts#L88)

#### description

> **description**: `string`

#### url?

> `optional` **url?**: `string`

***

### fixable?

> `optional` **fixable?**: `"text"`

Defined in: [rule.ts:94](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/rule.ts#L94)

Present if the rule can emit an autofix.

***

### messages?

> `optional` **messages?**: `Record`\<`string`, `string`\>

Defined in: [rule.ts:90](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/rule.ts#L90)

messageId → template string, `{{key}}` interpolated from report `data`.

***

### name

> **name**: `string`

Defined in: [rule.ts:85](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/rule.ts#L85)

Short name, unique within its rulepack (e.g. 'corrective-antithesis').
