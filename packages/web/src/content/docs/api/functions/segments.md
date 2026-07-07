---
editUrl: false
next: false
prev: false
title: "segments"
---

> **segments**(`text`, `lints`, `priority?`): [`Segment`](/api/interfaces/segment/)[]

Defined in: [linter.ts:119](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/linter.ts#L119)

Flatten possibly-overlapping lints into non-overlapping segments, so a UI can
wrap each in exactly one span/mark. When lints contend for a character, the
one with the LOWER `priority(lint)` number wins (ties keep the first seen).
Default priority is 0 for all — pass a priority (e.g. from a pack's category
order) to make overlaps deterministic.

## Parameters

### text

`string`

### lints

[`Lint`](/api/interfaces/lint/)[]

### priority?

(`lint`) => `number`

## Returns

[`Segment`](/api/interfaces/segment/)[]
