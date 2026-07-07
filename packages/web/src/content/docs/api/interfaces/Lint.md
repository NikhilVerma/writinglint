---
editUrl: false
next: false
prev: false
title: "Lint"
---

Defined in: [rule.ts:27](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/rule.ts#L27)

A single reported problem — the linter's output unit (was `Finding`).

## Properties

### category

> **category**: `string`

Defined in: [rule.ts:31](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/rule.ts#L31)

The rule's category (pack-defined), for grouping / colour.

***

### end

> **end**: `number`

Defined in: [rule.ts:36](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/rule.ts#L36)

Char offset into the original text (exclusive).

***

### fix?

> `optional` **fix?**: [`TextFix`](/api/interfaces/textfix/)

Defined in: [rule.ts:41](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/rule.ts#L41)

***

### message

> **message**: `string`

Defined in: [rule.ts:40](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/rule.ts#L40)

Why it was flagged, in plain language.

***

### ruleId

> **ruleId**: `string`

Defined in: [rule.ts:29](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/rule.ts#L29)

Namespaced identifier, e.g. 'ai-style/corrective-antithesis'.

***

### severity

> **severity**: [`ActiveSeverity`](/api/type-aliases/activeseverity/)

Defined in: [rule.ts:32](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/rule.ts#L32)

***

### start

> **start**: `number`

Defined in: [rule.ts:34](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/rule.ts#L34)

Char offset into the original text (inclusive).

***

### suggestion?

> `optional` **suggestion?**: `string`

Defined in: [rule.ts:43](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/rule.ts#L43)

Optional concrete suggestion (prose).

***

### text

> **text**: `string`

Defined in: [rule.ts:38](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/rule.ts#L38)

The exact flagged substring.
