# writinglint-parser-node

Node-side parser loader for [WritingLint](https://github.com/NikhilVerma/writinglint),
wrapping the offline [`nlpgraph`](https://www.npmjs.com/package/nlpgraph) ONNX
dependency parser.

```ts
import { loadParser } from 'writinglint-parser-node';
// download the model once: npx nlpgraph download --model xsmall --dir ./models
const parser = await loadParser({ modelDir: './models/xsmall' });
```
