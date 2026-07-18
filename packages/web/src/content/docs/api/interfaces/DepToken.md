---
editUrl: false
next: false
prev: false
title: "DepToken"
---

Defined in: [parse-types.ts:8](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/parse-types.ts#L8)

Parser-neutral Universal Dependencies data consumed by WritingLint.

Offsets are document-global UTF-16 code-unit indices, matching JavaScript's
`String.prototype.slice`. Token ids and heads are 1-based within a sentence;
a head of 0 marks the root.

## Properties

### deprel

> **deprel**: `string`

Defined in: [parse-types.ts:13](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/parse-types.ts#L13)

***

### end

> **end**: `number`

Defined in: [parse-types.ts:15](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/parse-types.ts#L15)

***

### form

> **form**: `string`

Defined in: [parse-types.ts:10](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/parse-types.ts#L10)

***

### head

> **head**: `number`

Defined in: [parse-types.ts:12](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/parse-types.ts#L12)

***

### id

> **id**: `number`

Defined in: [parse-types.ts:9](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/parse-types.ts#L9)

***

### lemma?

> `optional` **lemma?**: `string`

Defined in: [parse-types.ts:16](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/parse-types.ts#L16)

***

### start

> **start**: `number`

Defined in: [parse-types.ts:14](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/parse-types.ts#L14)

***

### upos

> **upos**: `string`

Defined in: [parse-types.ts:11](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/parse-types.ts#L11)
