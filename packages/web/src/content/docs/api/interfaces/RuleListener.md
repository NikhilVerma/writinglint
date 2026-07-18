---
editUrl: false
next: false
prev: false
title: "RuleListener"
---

Defined in: [rule.ts:84](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L84)

The callbacks a rule subscribes to. The engine visits `Document` once, then
every `Sentence` (with its dependency graph), then every `Token`.

## Methods

### Document()?

> `optional` **Document**(`doc`): `void`

Defined in: [rule.ts:85](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L85)

#### Parameters

##### doc

[`Document`](/api/interfaces/document/)

#### Returns

`void`

***

### DocumentExit()?

> `optional` **DocumentExit**(`doc`): `void`

Defined in: [rule.ts:90](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L90)

Runs after paragraph, sentence, and token listeners; useful for evidence aggregation.

#### Parameters

##### doc

[`Document`](/api/interfaces/document/)

#### Returns

`void`

***

### Paragraph()?

> `optional` **Paragraph**(`paragraph`): `void`

Defined in: [rule.ts:86](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L86)

#### Parameters

##### paragraph

[`Paragraph`](/api/interfaces/paragraph/)

#### Returns

`void`

***

### Sentence()?

> `optional` **Sentence**(`sentence`): `void`

Defined in: [rule.ts:87](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L87)

#### Parameters

##### sentence

[`Sentence`](/api/interfaces/sentence/)

#### Returns

`void`

***

### Token()?

> `optional` **Token**(`token`): `void`

Defined in: [rule.ts:88](https://github.com/NikhilVerma/writinglint/blob/a9e1a4eb6c8e8b01a9cfde5414d1167ac3240c7c/packages/core/src/rule.ts#L88)

#### Parameters

##### token

[`Tok`](/api/interfaces/tok/)

#### Returns

`void`
