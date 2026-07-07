---
editUrl: false
next: false
prev: false
title: "RuleContext"
---

Defined in: rule.ts:65

Everything a rule sees while running, plus how it reports.

## Type Parameters

### Options

`Options` = `unknown`

## Properties

### category

> `readonly` **category**: `string`

Defined in: rule.ts:67

***

### doc

> `readonly` **doc**: [`Document`](/api/interfaces/document/)

Defined in: rule.ts:69

***

### options

> `readonly` **options**: `Options`

Defined in: rule.ts:68

***

### ruleId

> `readonly` **ruleId**: `string`

Defined in: rule.ts:66

## Methods

### report()

> **report**(`descriptor`): `void`

Defined in: rule.ts:70

#### Parameters

##### descriptor

[`ReportDescriptor`](/api/interfaces/reportdescriptor/)

#### Returns

`void`
