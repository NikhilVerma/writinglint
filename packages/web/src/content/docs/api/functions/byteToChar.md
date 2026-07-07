---
editUrl: false
next: false
prev: false
title: "byteToChar"
---

> **byteToChar**(`s`): (`byte`) => `number`

Defined in: [graph.ts:32](https://github.com/NikhilVerma/writinglint/blob/65eaf2717483fea65019fabe0672678a5f3002f5/packages/core/src/graph.ts#L32)

Build a document-level UTF-8-byte → UTF-16-char-index converter for the
original text. nlpgraph 0.3.0 reports token offsets as document-global byte
offsets, so one converter over the whole doc replaces all sentence
re-anchoring — highlighting is now a direct `text.slice(start, end)`.

## Parameters

### s

`string`

## Returns

(`byte`) => `number`
