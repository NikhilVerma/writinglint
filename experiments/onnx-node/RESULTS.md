# Node ONNX parser benchmark

Measured locally on macOS arm64 with Node 24.10.0. The benchmark runs the full
Node parser path: owned TypeScript segmentation and WordPiece encoding, the main
ONNX graph, valid-tree decoding, and the selected-head relation graph.

## Correctness

Compared with the Python/PyTorch reference on the strict family-heldout corpus:

| Measure | Result |
| --- | ---: |
| Sentences | 299 |
| Tokens | 2,886 |
| Exact sentence parity | 100% |
| Exact token parity | 100% |

Exact token parity covers form, document-global UTF-16 offsets, UPOS, head, and
dependency relation. The existing TypeScript rule suite also passes through the
ONNX backend, and the CLI runs without starting Python.

## Performance

| Measure | Result |
| --- | ---: |
| ONNX session creation | 125.5 ms |
| RSS increase after session creation | 115.0 MiB |
| Sequential sentence latency, mean | 3.53 ms |
| Sequential sentence latency, p50 | 3.14 ms |
| Sequential sentence latency, p95 | 6.48 ms |
| 100-sentence / 972-token batch, mean | 87.3 ms |
| Batched throughput | 11,137 tokens/s |

Session creation excludes Node process startup. Warm measurements include both
graph calls and TypeScript preprocessing/decoding. The controlled sentences are
short, so natural-document length slices remain necessary. Run the reproducible
benchmark with:

```bash
node --conditions=source --import tsx experiments/onnx-node/benchmark.ts \
  models/rule-family-50-onnx /path/to/reference.jsonl
```

## INT8 deployment candidate

Dynamic INT8 quantization reduced the deployable parser bundle to approximately
16 MiB. Against the same FP32 reference it retained 2,874 / 2,886 exact tokens
(99.58%) and 287 / 299 exact sentences (95.99%), while the strict lint replay
remained unchanged at 99.77 F1 with no invalid dependency trees.

| Measure | INT8 result |
| --- | ---: |
| ONNX session creation | 109.1 ms |
| RSS increase after session creation | 50.1 MiB |
| Sequential sentence latency, mean | 2.35 ms |
| Sequential sentence latency, p50 | 2.14 ms |
| Sequential sentence latency, p95 | 3.97 ms |
| 100-sentence / 972-token batch | 44.4 ms |
| Batched throughput | 21,871 tokens/s |

The browser deployment uses this same artifact through ONNX Runtime Web/WASM;
browser-specific cold-start and warm-latency measurements are still pending.
