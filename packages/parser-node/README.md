# writinglint-parser-node

The default backend is the owned compact ONNX dependency parser. It runs fully
inside Node through `onnxruntime-node`; no Python process is required. The
Stanza bridge remains available as a development oracle and explicit fallback.

The compact INT8 model is included in the npm package. A source checkout can
stage the exact same verified files with `npm run setup-model`. Set
`WRITINGLINT_ONNX_MODEL` or pass `onnxModelDir` only to override the bundled
release:

```ts
import { loadParser } from 'writinglint-parser-node';

const parser = await loadParser({
  backend: 'onnx',
  onnxModelDir: '/path/to/another-model',
});
```

The runtime performs owned sentence/word segmentation, BERT WordPiece encoding,
the main ONNX graph, deterministic valid-tree decoding, and selected-head
relation scoring. Token offsets are document-global UTF-16 indices.

## Stanza oracle

To explicitly use the development oracle, install its isolated Python
environment and English models once:

```bash
npm run setup-stanza
```

Then use the parser normally:

```ts
import { loadParser } from 'writinglint-parser-node';

const parser = await loadParser({ backend: 'stanza' });
const sentences = await parser.parse('Trust the flags, not the number.');
```

The Stanza backend starts one long-lived Python process and communicates over
JSON-lines. The model is loaded once rather than once per document.

For non-workspace installs, configure:

- `STANZA_MODEL_DIR`: downloaded Stanza model directory.
- `WRITINGLINT_PYTHON`: Python executable with `stanza` installed.

The parser output uses document-global UTF-16 offsets, matching JavaScript
string indices exactly.
