# writinglint-core

The engine behind [WritingLint](https://github.com/NikhilVerma/writinglint): a
Document model over a dependency-parse + POS graph, an authorable Rule API
(`defineRule`), config resolution, and the `Linter`. Bring your own parser
(e.g. [`writinglint-parser-node`](https://www.npmjs.com/package/writinglint-parser-node)).

```ts
import { Linter, resolveConfig } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { recommended } from 'writinglint-rulepack-ai-style';

const linter = new Linter(await loadParser({ modelDir: './models/xsmall' }));
const { lints } = await linter.lint('Trust the graph, not the vibes.', resolveConfig(recommended));
```

See the [docs](https://writinglint.nikhilv.workers.dev) for the full API.
