---
editUrl: false
next: false
prev: false
title: "Document"
---

Defined in: [document.ts:40](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/document.ts#L40)

A parsed document: the text, its sentences, and a flat token stream.

## Properties

### sentences

> **sentences**: [`Sentence`](/api/interfaces/sentence/)[]

Defined in: [document.ts:42](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/document.ts#L42)

***

### text

> **text**: `string`

Defined in: [document.ts:41](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/document.ts#L41)

***

### tokens

> **tokens**: [`Tok`](/api/interfaces/tok/)[]

Defined in: [document.ts:44](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/document.ts#L44)

Flat word-token stream across the whole document (lexical convenience).
