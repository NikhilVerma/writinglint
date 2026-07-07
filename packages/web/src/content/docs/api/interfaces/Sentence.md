---
editUrl: false
next: false
prev: false
title: "Sentence"
---

Defined in: document.ts:27

A sentence: its global char anchor, its dependency graph, and word tokens.

## Properties

### dep

> **dep**: [`DepSentence`](/api/interfaces/depsentence/)

Defined in: document.ts:34

Dependency graph for structural rules (from nlpgraph's parser).

***

### end

> **end**: `number`

Defined in: document.ts:30

***

### index

> **index**: `number`

Defined in: document.ts:32

Position of this sentence in the document.

***

### start

> **start**: `number`

Defined in: document.ts:29

***

### text

> **text**: `string`

Defined in: document.ts:28

***

### words

> **words**: [`Tok`](/api/interfaces/tok/)[]

Defined in: document.ts:36

Non-punctuation tokens with global char offsets (for lexical rules).
