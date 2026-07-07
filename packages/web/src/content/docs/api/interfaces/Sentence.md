---
editUrl: false
next: false
prev: false
title: "Sentence"
---

Defined in: [document.ts:27](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/document.ts#L27)

A sentence: its global char anchor, its dependency graph, and word tokens.

## Properties

### dep

> **dep**: [`DepSentence`](/api/interfaces/depsentence/)

Defined in: [document.ts:34](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/document.ts#L34)

Dependency graph for structural rules (from nlpgraph's parser).

***

### end

> **end**: `number`

Defined in: [document.ts:30](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/document.ts#L30)

***

### index

> **index**: `number`

Defined in: [document.ts:32](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/document.ts#L32)

Position of this sentence in the document.

***

### start

> **start**: `number`

Defined in: [document.ts:29](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/document.ts#L29)

***

### text

> **text**: `string`

Defined in: [document.ts:28](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/document.ts#L28)

***

### words

> **words**: [`Tok`](/api/interfaces/tok/)[]

Defined in: [document.ts:36](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/document.ts#L36)

Non-punctuation tokens with global char offsets (for lexical rules).
