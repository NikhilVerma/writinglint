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
  // Optional: lower this on especially memory-constrained machines.
  onnxMaxBatchSentences: 16,
});
```

The runtime performs owned sentence/word segmentation, BERT WordPiece encoding,
the main ONNX graph, deterministic valid-tree decoding, and selected-head
relation scoring. Token offsets are document-global UTF-16 indices.
Individual model calls remain bounded to 256 encoder subwords. Longer
unpunctuated spans are split at token boundaries without dropping text; graph
edges do not cross those defensive chunk boundaries. Documents are also parsed
in sequential batches of at most 16 sentence chunks. This keeps ONNX tensor
allocation bounded as a file or corpus grows instead of batching a whole large
document into memory at once.

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

## License

Runtime source code is MIT. The bundled model has an explicit file-level
license boundary: its trained ONNX graphs are distributed under CC BY-SA 4.0
for conservative compliance with the UD English EWT training lineage, while
the BERT-derived tokenizer retains its Apache 2.0 lineage. See
[`MODEL_LICENSE.md`](./MODEL_LICENSE.md) for attribution and provenance.
