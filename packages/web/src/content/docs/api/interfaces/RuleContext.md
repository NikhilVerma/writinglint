---
editUrl: false
next: false
prev: false
title: "RuleContext"
---

Defined in: [rule.ts:65](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/rule.ts#L65)

Everything a rule sees while running, plus how it reports.

## Type Parameters

### Options

`Options` = `unknown`

## Properties

### category

> `readonly` **category**: `string`

Defined in: [rule.ts:67](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/rule.ts#L67)

***

### doc

> `readonly` **doc**: [`Document`](/api/interfaces/document/)

Defined in: [rule.ts:69](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/rule.ts#L69)

***

### options

> `readonly` **options**: `Options`

Defined in: [rule.ts:68](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/rule.ts#L68)

***

### ruleId

> `readonly` **ruleId**: `string`

Defined in: [rule.ts:66](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/rule.ts#L66)

## Methods

### report()

> **report**(`descriptor`): `void`

Defined in: [rule.ts:70](https://github.com/NikhilVerma/writinglint/blob/03fe40665ab697d2127e29daf10ac265fe881981/packages/core/src/rule.ts#L70)

#### Parameters

##### descriptor

[`ReportDescriptor`](/api/interfaces/reportdescriptor/)

#### Returns

`void`
