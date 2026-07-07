---
editUrl: false
next: false
prev: false
title: "ResolvedConfig"
---

Defined in: [config.ts:37](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/config.ts#L37)

A flattened, ready-to-run config.

## Properties

### categories

> **categories**: `Record`\<`string`, [`Category`](/api/interfaces/category/)\>

Defined in: [config.ts:41](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/config.ts#L41)

Merged category metadata from every referenced pack, keyed by category id.

***

### rules

> **rules**: `Map`\<`string`, [`ResolvedRule`](/api/interfaces/resolvedrule/)\>

Defined in: [config.ts:39](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/config.ts#L39)

ruleId → the resolved, enabled rule. Disabled rules are absent.
