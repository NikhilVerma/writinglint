---
editUrl: false
next: false
prev: false
title: "Linter"
---

Defined in: [linter.ts:30](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/linter.ts#L30)

## Constructors

### Constructor

> **new Linter**(`parser`): `Linter`

Defined in: [linter.ts:31](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/linter.ts#L31)

#### Parameters

##### parser

[`Parser`](/api/interfaces/parser/)

#### Returns

`Linter`

## Methods

### lint()

> **lint**(`text`, `config`): `Promise`\<[`LintReport`](/api/interfaces/lintreport/)\>

Defined in: [linter.ts:33](https://github.com/NikhilVerma/writinglint/blob/751f16f855024b2d84b4139fa71b4f3cfdff15f5/packages/core/src/linter.ts#L33)

#### Parameters

##### text

`string`

##### config

[`Config`](/api/interfaces/config/) \| [`ResolvedConfig`](/api/interfaces/resolvedconfig/)

#### Returns

`Promise`\<[`LintReport`](/api/interfaces/lintreport/)\>
