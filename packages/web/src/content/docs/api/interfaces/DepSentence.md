---
editUrl: false
next: false
prev: false
title: "DepSentence"
---

Defined in: [graph.ts:16](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/graph.ts#L16)

A parsed sentence plus its graph indices.

## Properties

### children

> **children**: `Map`\<`number`, [`DepToken`](/api/interfaces/deptoken/)[]\>

Defined in: [graph.ts:20](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/graph.ts#L20)

children.get(headId) → dependents of that token.

***

### text

> **text**: `string`

Defined in: [graph.ts:17](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/graph.ts#L17)

***

### tokens

> **tokens**: [`DepToken`](/api/interfaces/deptoken/)[]

Defined in: [graph.ts:18](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/graph.ts#L18)
