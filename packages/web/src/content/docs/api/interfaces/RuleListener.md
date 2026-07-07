---
editUrl: false
next: false
prev: false
title: "RuleListener"
---

Defined in: rule.ts:77

The callbacks a rule subscribes to. The engine visits `Document` once, then
every `Sentence` (with its dependency graph), then every `Token`.

## Methods

### Document()?

> `optional` **Document**(`doc`): `void`

Defined in: rule.ts:78

#### Parameters

##### doc

[`Document`](/api/interfaces/document/)

#### Returns

`void`

***

### Sentence()?

> `optional` **Sentence**(`sentence`): `void`

Defined in: rule.ts:79

#### Parameters

##### sentence

[`Sentence`](/api/interfaces/sentence/)

#### Returns

`void`

***

### Token()?

> `optional` **Token**(`token`): `void`

Defined in: rule.ts:80

#### Parameters

##### token

[`Tok`](/api/interfaces/tok/)

#### Returns

`void`
