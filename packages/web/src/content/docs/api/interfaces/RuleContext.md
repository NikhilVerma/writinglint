---
editUrl: false
next: false
prev: false
title: "RuleContext"
---

Defined in: [rule.ts:70](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L70)

Everything a rule sees while running, plus how it reports.

## Type Parameters

### Options

`Options` = `unknown`

## Properties

### category

> `readonly` **category**: `string`

Defined in: [rule.ts:72](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L72)

***

### doc

> `readonly` **doc**: [`Document`](/api/interfaces/document/)

Defined in: [rule.ts:74](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L74)

***

### findings

> `readonly` **findings**: readonly [`Lint`](/api/interfaces/lint/)[]

Defined in: [rule.ts:76](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L76)

Findings emitted so far, for rules that combine weak evidence at document exit.

***

### options

> `readonly` **options**: `Options`

Defined in: [rule.ts:73](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L73)

***

### ruleId

> `readonly` **ruleId**: `string`

Defined in: [rule.ts:71](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L71)

## Methods

### report()

> **report**(`descriptor`): `void`

Defined in: [rule.ts:77](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L77)

#### Parameters

##### descriptor

[`ReportDescriptor`](/api/interfaces/reportdescriptor/)

#### Returns

`void`
