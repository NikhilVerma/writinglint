---
editUrl: false
next: false
prev: false
title: "ResolvedConfig"
---

Defined in: [config.ts:40](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/config.ts#L40)

A flattened, ready-to-run config.

## Properties

### categories

> **categories**: `Record`\<`string`, [`Category`](/api/interfaces/category/)\>

Defined in: [config.ts:44](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/config.ts#L44)

Merged category metadata from every referenced pack, keyed by category id.

***

### minimumSeverity

> **minimumSeverity**: [`ActiveSeverity`](/api/type-aliases/activeseverity/)

Defined in: [config.ts:45](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/config.ts#L45)

***

### rules

> **rules**: `Map`\<`string`, [`ResolvedRule`](/api/interfaces/resolvedrule/)\>

Defined in: [config.ts:42](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/config.ts#L42)

ruleId → the resolved, enabled rule. Disabled rules are absent.
