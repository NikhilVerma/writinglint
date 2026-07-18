---
editUrl: false
next: false
prev: false
title: "Document"
---

Defined in: [document.ts:38](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/document.ts#L38)

A parsed document: the text, its sentences, and a flat token stream.

## Properties

### sentences

> **sentences**: [`Sentence`](/api/interfaces/sentence/)[]

Defined in: [document.ts:40](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/document.ts#L40)

***

### text

> **text**: `string`

Defined in: [document.ts:39](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/document.ts#L39)

***

### tokens

> **tokens**: [`Tok`](/api/interfaces/tok/)[]

Defined in: [document.ts:42](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/document.ts#L42)

Flat word-token stream across the whole document (lexical convenience).
