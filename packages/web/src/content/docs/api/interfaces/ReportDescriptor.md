---
editUrl: false
next: false
prev: false
title: "ReportDescriptor"
---

Defined in: [rule.ts:56](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/rule.ts#L56)

What a rule passes to `ctx.report`. Give a location as either an explicit
`span` or a set of `tokens` (with the `sentence` they belong to, so the engine
can resolve their global offsets to a span). Give the message as a
literal `message`, or a `messageId` into `meta.messages` with `data` for
`{{placeholder}}` interpolation.

## Properties

### confidence?

> `optional` **confidence?**: [`Confidence`](/api/type-aliases/confidence/)

Defined in: [rule.ts:66](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/rule.ts#L66)

Certainty for this occurrence; overrides the rule's default confidence.

***

### data?

> `optional` **data?**: `Record`\<`string`, `string` \| `number`\>

Defined in: [rule.ts:62](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/rule.ts#L62)

***

### fix?

> `optional` **fix?**: [`TextFix`](/api/interfaces/textfix/)

Defined in: [rule.ts:63](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/rule.ts#L63)

***

### message?

> `optional` **message?**: `string`

Defined in: [rule.ts:61](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/rule.ts#L61)

***

### messageId?

> `optional` **messageId?**: `string`

Defined in: [rule.ts:60](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/rule.ts#L60)

***

### sentence?

> `optional` **sentence?**: [`DepSentence`](/api/interfaces/depsentence/)

Defined in: [rule.ts:59](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/rule.ts#L59)

***

### span?

> `optional` **span?**: `object`

Defined in: [rule.ts:57](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/rule.ts#L57)

#### end

> **end**: `number`

#### start

> **start**: `number`

***

### suggestion?

> `optional` **suggestion?**: `string`

Defined in: [rule.ts:64](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/rule.ts#L64)

***

### tokens?

> `optional` **tokens?**: [`DepToken`](/api/interfaces/deptoken/)[]

Defined in: [rule.ts:58](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/rule.ts#L58)
