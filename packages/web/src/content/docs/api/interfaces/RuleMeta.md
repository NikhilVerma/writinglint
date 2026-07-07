---
editUrl: false
next: false
prev: false
title: "RuleMeta"
---

Defined in: rule.ts:83

## Properties

### category

> **category**: `string`

Defined in: rule.ts:87

Category id this rule belongs to (defined by the rulepack).

***

### defaultSeverity?

> `optional` **defaultSeverity?**: [`ActiveSeverity`](/api/type-aliases/activeseverity/)

Defined in: rule.ts:92

Severity applied when the rule is turned on without an explicit level.

***

### docs

> **docs**: `object`

Defined in: rule.ts:88

#### description

> **description**: `string`

#### url?

> `optional` **url?**: `string`

***

### fixable?

> `optional` **fixable?**: `"text"`

Defined in: rule.ts:94

Present if the rule can emit an autofix.

***

### messages?

> `optional` **messages?**: `Record`\<`string`, `string`\>

Defined in: rule.ts:90

messageId → template string, `{{key}}` interpolated from report `data`.

***

### name

> **name**: `string`

Defined in: rule.ts:85

Short name, unique within its rulepack (e.g. 'corrective-antithesis').
