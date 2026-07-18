---
editUrl: false
next: false
prev: false
title: "RuleMeta"
---

Defined in: [rule.ts:93](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L93)

## Properties

### category

> **category**: `string`

Defined in: [rule.ts:97](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L97)

Category id this rule belongs to (defined by the rulepack).

***

### defaultConfidence?

> `optional` **defaultConfidence?**: [`Confidence`](/api/type-aliases/confidence/)

Defined in: [rule.ts:104](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L104)

Certainty used by `auto` configs when a report does not provide its own.

***

### defaultSeverity?

> `optional` **defaultSeverity?**: [`ActiveSeverity`](/api/type-aliases/activeseverity/)

Defined in: [rule.ts:102](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L102)

Severity applied when the rule is turned on without an explicit level.

***

### docs

> **docs**: `object`

Defined in: [rule.ts:98](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L98)

#### description

> **description**: `string`

#### url?

> `optional` **url?**: `string`

***

### fixable?

> `optional` **fixable?**: `"text"`

Defined in: [rule.ts:106](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L106)

Present if the rule can emit an autofix.

***

### messages?

> `optional` **messages?**: `Record`\<`string`, `string`\>

Defined in: [rule.ts:100](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L100)

messageId → template string, `{{key}}` interpolated from report `data`.

***

### name

> **name**: `string`

Defined in: [rule.ts:95](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L95)

Short name, unique within its rulepack (e.g. 'corrective-antithesis').
