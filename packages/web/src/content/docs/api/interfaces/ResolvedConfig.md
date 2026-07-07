---
editUrl: false
next: false
prev: false
title: "ResolvedConfig"
---

Defined in: config.ts:37

A flattened, ready-to-run config.

## Properties

### categories

> **categories**: `Record`\<`string`, [`Category`](/api/interfaces/category/)\>

Defined in: config.ts:41

Merged category metadata from every referenced pack, keyed by category id.

***

### rules

> **rules**: `Map`\<`string`, [`ResolvedRule`](/api/interfaces/resolvedrule/)\>

Defined in: config.ts:39

ruleId → the resolved, enabled rule. Disabled rules are absent.
