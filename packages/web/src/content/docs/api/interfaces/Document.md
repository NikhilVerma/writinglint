---
editUrl: false
next: false
prev: false
title: "Document"
---

Defined in: [document.ts:47](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/document.ts#L47)

A parsed document: the text, its sentences, and a flat token stream.

## Properties

### paragraphs

> **paragraphs**: [`Paragraph`](/api/interfaces/paragraph/)[]

Defined in: [document.ts:51](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/document.ts#L51)

Blank-line-delimited blocks for paragraph-level rules and aggregation.

***

### sentences

> **sentences**: [`Sentence`](/api/interfaces/sentence/)[]

Defined in: [document.ts:49](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/document.ts#L49)

***

### text

> **text**: `string`

Defined in: [document.ts:48](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/document.ts#L48)

***

### tokens

> **tokens**: [`Tok`](/api/interfaces/tok/)[]

Defined in: [document.ts:53](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/document.ts#L53)

Flat word-token stream across the whole document (lexical convenience).
