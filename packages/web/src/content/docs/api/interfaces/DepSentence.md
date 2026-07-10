---
editUrl: false
next: false
prev: false
title: "DepSentence"
---

Defined in: [graph.ts:17](https://github.com/NikhilVerma/writinglint/blob/d10767b4924bdcb7ea89bef9452a52cf8ffbc6f8/packages/core/src/graph.ts#L17)

A parsed sentence plus its graph indices and a byte→char offset converter.

## Properties

### children

> **children**: `Map`\<`number`, `DepToken`[]\>

Defined in: [graph.ts:21](https://github.com/NikhilVerma/writinglint/blob/d10767b4924bdcb7ea89bef9452a52cf8ffbc6f8/packages/core/src/graph.ts#L21)

children.get(headId) → dependents of that token.

***

### text

> **text**: `string`

Defined in: [graph.ts:18](https://github.com/NikhilVerma/writinglint/blob/d10767b4924bdcb7ea89bef9452a52cf8ffbc6f8/packages/core/src/graph.ts#L18)

***

### toGlobal

> **toGlobal**: (`byteOffset`) => `number`

Defined in: [graph.ts:23](https://github.com/NikhilVerma/writinglint/blob/d10767b4924bdcb7ea89bef9452a52cf8ffbc6f8/packages/core/src/graph.ts#L23)

Convert a DOCUMENT-GLOBAL UTF-8 byte offset (nlpgraph 0.3.0) to a char index.

#### Parameters

##### byteOffset

`number`

#### Returns

`number`

***

### tokens

> **tokens**: `DepToken`[]

Defined in: [graph.ts:19](https://github.com/NikhilVerma/writinglint/blob/d10767b4924bdcb7ea89bef9452a52cf8ffbc6f8/packages/core/src/graph.ts#L19)
