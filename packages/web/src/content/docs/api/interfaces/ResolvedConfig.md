---
editUrl: false
next: false
prev: false
title: "ResolvedConfig"
---

Defined in: [config.ts:37](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/config.ts#L37)

A flattened, ready-to-run config.

## Properties

### categories

> **categories**: `Record`\<`string`, [`Category`](/api/interfaces/category/)\>

Defined in: [config.ts:41](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/config.ts#L41)

Merged category metadata from every referenced pack, keyed by category id.

***

### rules

> **rules**: `Map`\<`string`, [`ResolvedRule`](/api/interfaces/resolvedrule/)\>

Defined in: [config.ts:39](https://github.com/NikhilVerma/writinglint/blob/ed446792b9bccc06592b119c29821c9764b456a8/packages/core/src/config.ts#L39)

ruleId → the resolved, enabled rule. Disabled rules are absent.
