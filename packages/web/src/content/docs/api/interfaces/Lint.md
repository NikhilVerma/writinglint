---
editUrl: false
next: false
prev: false
title: "Lint"
---

Defined in: [rule.ts:28](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L28)

A single reported problem — the linter's output unit (was `Finding`).

## Properties

### category

> **category**: `string`

Defined in: [rule.ts:32](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L32)

The rule's category (pack-defined), for grouping / colour.

***

### confidence

> **confidence**: [`Confidence`](/api/type-aliases/confidence/)

Defined in: [rule.ts:35](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L35)

Detector certainty, independent of how the finding is rendered or gated.

***

### end

> **end**: `number`

Defined in: [rule.ts:39](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L39)

Char offset into the original text (exclusive).

***

### fix?

> `optional` **fix?**: [`TextFix`](/api/interfaces/textfix/)

Defined in: [rule.ts:44](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L44)

***

### message

> **message**: `string`

Defined in: [rule.ts:43](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L43)

Why it was flagged, in plain language.

***

### ruleId

> **ruleId**: `string`

Defined in: [rule.ts:30](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L30)

Namespaced identifier, e.g. 'ai-style/corrective-antithesis'.

***

### severity

> **severity**: [`ActiveSeverity`](/api/type-aliases/activeseverity/)

Defined in: [rule.ts:33](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L33)

***

### start

> **start**: `number`

Defined in: [rule.ts:37](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L37)

Char offset into the original text (inclusive).

***

### suggestion?

> `optional` **suggestion?**: `string`

Defined in: [rule.ts:46](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L46)

Optional concrete suggestion (prose).

***

### text

> **text**: `string`

Defined in: [rule.ts:41](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L41)

The exact flagged substring.
