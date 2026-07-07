---
editUrl: false
next: false
prev: false
title: "ReportDescriptor"
---

Defined in: rule.ts:53

What a rule passes to `ctx.report`. Give a location as either an explicit
`span` or a set of `tokens` (with the `sentence` they belong to, so the engine
can resolve their byte offsets to a global char span). Give the message as a
literal `message`, or a `messageId` into `meta.messages` with `data` for
`{{placeholder}}` interpolation.

## Properties

### data?

> `optional` **data?**: `Record`\<`string`, `string` \| `number`\>

Defined in: rule.ts:59

***

### fix?

> `optional` **fix?**: [`TextFix`](/api/interfaces/textfix/)

Defined in: rule.ts:60

***

### message?

> `optional` **message?**: `string`

Defined in: rule.ts:58

***

### messageId?

> `optional` **messageId?**: `string`

Defined in: rule.ts:57

***

### sentence?

> `optional` **sentence?**: [`DepSentence`](/api/interfaces/depsentence/)

Defined in: rule.ts:56

***

### span?

> `optional` **span?**: `object`

Defined in: rule.ts:54

#### end

> **end**: `number`

#### start

> **start**: `number`

***

### suggestion?

> `optional` **suggestion?**: `string`

Defined in: rule.ts:61

***

### tokens?

> `optional` **tokens?**: `DepToken`[]

Defined in: rule.ts:55
