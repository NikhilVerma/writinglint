---
editUrl: false
next: false
prev: false
title: "RuleListener"
---

Defined in: [rule.ts:77](https://github.com/NikhilVerma/writinglint/blob/65eaf2717483fea65019fabe0672678a5f3002f5/packages/core/src/rule.ts#L77)

The callbacks a rule subscribes to. The engine visits `Document` once, then
every `Sentence` (with its dependency graph), then every `Token`.

## Methods

### Document()?

> `optional` **Document**(`doc`): `void`

Defined in: [rule.ts:78](https://github.com/NikhilVerma/writinglint/blob/65eaf2717483fea65019fabe0672678a5f3002f5/packages/core/src/rule.ts#L78)

#### Parameters

##### doc

[`Document`](/api/interfaces/document/)

#### Returns

`void`

***

### Sentence()?

> `optional` **Sentence**(`sentence`): `void`

Defined in: [rule.ts:79](https://github.com/NikhilVerma/writinglint/blob/65eaf2717483fea65019fabe0672678a5f3002f5/packages/core/src/rule.ts#L79)

#### Parameters

##### sentence

[`Sentence`](/api/interfaces/sentence/)

#### Returns

`void`

***

### Token()?

> `optional` **Token**(`token`): `void`

Defined in: [rule.ts:80](https://github.com/NikhilVerma/writinglint/blob/65eaf2717483fea65019fabe0672678a5f3002f5/packages/core/src/rule.ts#L80)

#### Parameters

##### token

[`Tok`](/api/interfaces/tok/)

#### Returns

`void`
