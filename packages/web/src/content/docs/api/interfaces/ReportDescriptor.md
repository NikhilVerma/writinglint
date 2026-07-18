---
editUrl: false
next: false
prev: false
title: "ReportDescriptor"
---

Defined in: [rule.ts:53](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/rule.ts#L53)

What a rule passes to `ctx.report`. Give a location as either an explicit
`span` or a set of `tokens` (with the `sentence` they belong to, so the engine
can resolve their global offsets to a span). Give the message as a
literal `message`, or a `messageId` into `meta.messages` with `data` for
`{{placeholder}}` interpolation.

## Properties

### data?

> `optional` **data?**: `Record`\<`string`, `string` \| `number`\>

Defined in: [rule.ts:59](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/rule.ts#L59)

***

### fix?

> `optional` **fix?**: [`TextFix`](/api/interfaces/textfix/)

Defined in: [rule.ts:60](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/rule.ts#L60)

***

### message?

> `optional` **message?**: `string`

Defined in: [rule.ts:58](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/rule.ts#L58)

***

### messageId?

> `optional` **messageId?**: `string`

Defined in: [rule.ts:57](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/rule.ts#L57)

***

### sentence?

> `optional` **sentence?**: [`DepSentence`](/api/interfaces/depsentence/)

Defined in: [rule.ts:56](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/rule.ts#L56)

***

### span?

> `optional` **span?**: `object`

Defined in: [rule.ts:54](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/rule.ts#L54)

#### end

> **end**: `number`

#### start

> **start**: `number`

***

### suggestion?

> `optional` **suggestion?**: `string`

Defined in: [rule.ts:61](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/rule.ts#L61)

***

### tokens?

> `optional` **tokens?**: [`DepToken`](/api/interfaces/deptoken/)[]

Defined in: [rule.ts:55](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/rule.ts#L55)
