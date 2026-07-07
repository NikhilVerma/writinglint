---
editUrl: false
next: false
prev: false
title: "Sentence"
---

Defined in: [document.ts:27](https://github.com/NikhilVerma/writinglint/blob/65eaf2717483fea65019fabe0672678a5f3002f5/packages/core/src/document.ts#L27)

A sentence: its global char anchor, its dependency graph, and word tokens.

## Properties

### dep

> **dep**: [`DepSentence`](/api/interfaces/depsentence/)

Defined in: [document.ts:34](https://github.com/NikhilVerma/writinglint/blob/65eaf2717483fea65019fabe0672678a5f3002f5/packages/core/src/document.ts#L34)

Dependency graph for structural rules (from nlpgraph's parser).

***

### end

> **end**: `number`

Defined in: [document.ts:30](https://github.com/NikhilVerma/writinglint/blob/65eaf2717483fea65019fabe0672678a5f3002f5/packages/core/src/document.ts#L30)

***

### index

> **index**: `number`

Defined in: [document.ts:32](https://github.com/NikhilVerma/writinglint/blob/65eaf2717483fea65019fabe0672678a5f3002f5/packages/core/src/document.ts#L32)

Position of this sentence in the document.

***

### start

> **start**: `number`

Defined in: [document.ts:29](https://github.com/NikhilVerma/writinglint/blob/65eaf2717483fea65019fabe0672678a5f3002f5/packages/core/src/document.ts#L29)

***

### text

> **text**: `string`

Defined in: [document.ts:28](https://github.com/NikhilVerma/writinglint/blob/65eaf2717483fea65019fabe0672678a5f3002f5/packages/core/src/document.ts#L28)

***

### words

> **words**: [`Tok`](/api/interfaces/tok/)[]

Defined in: [document.ts:36](https://github.com/NikhilVerma/writinglint/blob/65eaf2717483fea65019fabe0672678a5f3002f5/packages/core/src/document.ts#L36)

Non-punctuation tokens with global char offsets (for lexical rules).
