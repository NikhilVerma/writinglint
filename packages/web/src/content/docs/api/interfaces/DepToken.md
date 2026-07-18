---
editUrl: false
next: false
prev: false
title: "DepToken"
---

Defined in: parse-types.ts:8

Parser-neutral Universal Dependencies data consumed by WritingLint.

Offsets are document-global UTF-16 code-unit indices, matching JavaScript's
`String.prototype.slice`. Token ids and heads are 1-based within a sentence;
a head of 0 marks the root.

## Properties

### deprel

> **deprel**: `string`

Defined in: parse-types.ts:13

***

### end

> **end**: `number`

Defined in: parse-types.ts:15

***

### form

> **form**: `string`

Defined in: parse-types.ts:10

***

### head

> **head**: `number`

Defined in: parse-types.ts:12

***

### id

> **id**: `number`

Defined in: parse-types.ts:9

***

### lemma?

> `optional` **lemma?**: `string`

Defined in: parse-types.ts:16

***

### start

> **start**: `number`

Defined in: parse-types.ts:14

***

### upos

> **upos**: `string`

Defined in: parse-types.ts:11
