---
editUrl: false
next: false
prev: false
title: "resolveConfig"
---

> **resolveConfig**(`config`): [`ResolvedConfig`](/api/interfaces/resolvedconfig/)

Defined in: [config.ts:74](https://github.com/NikhilVerma/writinglint/blob/main/packages/core/src/config.ts#L74)

Flatten a Config into the set of enabled rules + merged category metadata.
Rules set to 'off' (or never turned on) are omitted. A rule referencing an
unregistered pack, an unknown rule name, or 'off' is skipped silently — a
config can disable rules from packs it doesn't otherwise use.

## Parameters

### config

[`Config`](/api/interfaces/config/)

## Returns

[`ResolvedConfig`](/api/interfaces/resolvedconfig/)
