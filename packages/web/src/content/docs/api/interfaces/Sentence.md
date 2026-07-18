---
editUrl: false
next: false
prev: false
title: "Sentence"
---

Defined in: [document.ts:25](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/document.ts#L25)

A sentence: its global char anchor, its dependency graph, and word tokens.

## Properties

### dep

> **dep**: [`DepSentence`](/api/interfaces/depsentence/)

Defined in: [document.ts:32](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/document.ts#L32)

Dependency graph for structural rules.

***

### end

> **end**: `number`

Defined in: [document.ts:28](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/document.ts#L28)

***

### index

> **index**: `number`

Defined in: [document.ts:30](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/document.ts#L30)

Position of this sentence in the document.

***

### start

> **start**: `number`

Defined in: [document.ts:27](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/document.ts#L27)

***

### text

> **text**: `string`

Defined in: [document.ts:26](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/document.ts#L26)

***

### words

> **words**: [`Tok`](/api/interfaces/tok/)[]

Defined in: [document.ts:34](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/document.ts#L34)

Non-punctuation tokens with global char offsets (for lexical rules).
