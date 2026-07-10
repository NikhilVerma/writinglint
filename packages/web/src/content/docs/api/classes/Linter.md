---
editUrl: false
next: false
prev: false
title: "Linter"
---

Defined in: [linter.ts:30](https://github.com/NikhilVerma/writinglint/blob/d10767b4924bdcb7ea89bef9452a52cf8ffbc6f8/packages/core/src/linter.ts#L30)

## Constructors

### Constructor

> **new Linter**(`parser`): `Linter`

Defined in: [linter.ts:31](https://github.com/NikhilVerma/writinglint/blob/d10767b4924bdcb7ea89bef9452a52cf8ffbc6f8/packages/core/src/linter.ts#L31)

#### Parameters

##### parser

[`Parser`](/api/interfaces/parser/)

#### Returns

`Linter`

## Methods

### lint()

> **lint**(`text`, `config`): `Promise`\<[`LintReport`](/api/interfaces/lintreport/)\>

Defined in: [linter.ts:33](https://github.com/NikhilVerma/writinglint/blob/d10767b4924bdcb7ea89bef9452a52cf8ffbc6f8/packages/core/src/linter.ts#L33)

#### Parameters

##### text

`string`

##### config

[`Config`](/api/interfaces/config/) \| [`ResolvedConfig`](/api/interfaces/resolvedconfig/)

#### Returns

`Promise`\<[`LintReport`](/api/interfaces/lintreport/)\>
