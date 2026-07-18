---
editUrl: false
next: false
prev: false
title: "decodeTree"
---

> **decodeTree**(`scores`): `number`[]

Defined in: [decode.ts:52](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/decode.ts#L52)

Decode dependent-by-head scores. Rows are dependents 1..N; columns are ROOT
(0), then tokens 1..N. Ties consistently prefer the lowest token index.

## Parameters

### scores

readonly readonly `number`[][]

## Returns

`number`[]
