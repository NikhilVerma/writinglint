/**
 * Browser-side loader for the nlpgraph dependency parser + our classifier.
 *
 * Everything is served from our own origin (no runtime network calls, no CDN):
 *   /model/model.fp16.onnx  — the biaffine parser (~145 MB, fetched with progress)
 *   /model/config.json      — parser config (rel/pos vocabs)
 *   /model/tokenizer.json   — DeBERTa sub-word tokenizer (loaded by transformers.js)
 *   /ort/*.wasm             — onnxruntime-web WASM kernels
 *   /model/classifier.json  — our data-free stylometric model
 *
 * Follows nlpgraph's browser conventions: onnxruntime-web on WASM, a transformers.js
 * tokenizer instance passed straight to NlpGraph.load (so no HuggingFace-hub fetch).
 */
import * as ort from 'onnxruntime-web';
import { AutoTokenizer, env } from '@huggingface/transformers';
import { NlpGraph } from 'nlpgraph/browser';
import type { Parser } from '@writinglint/core';
import type { Model } from '@writinglint/rulepack-ai-style';

export interface Progress {
  (stage: string, loaded?: number, total?: number): void;
}

/** Fetch an ArrayBuffer while reporting byte progress (the 145 MB model). */
async function fetchBytes(url: string, onProgress: Progress): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress('model', loaded, total);
  }
  const out = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export interface Loaded {
  parser: Parser;
  model: Model;
}

let cached: Promise<Loaded> | undefined;

export function loadEngine(onProgress: Progress = () => {}): Promise<Loaded> {
  return (cached ??= (async () => {
    // Deterministic single-threaded WASM; serve kernels from our own /ort/.
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = '/ort/';

    // transformers.js: local-only, load the tokenizer from /model/ (no hub call).
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = '/';

    onProgress('tokenizer');
    const tokenizer = await AutoTokenizer.from_pretrained('model');

    onProgress('classifier');
    const model = (await (await fetch('/model/classifier.json')).json()) as Model;

    onProgress('model', 0, 1);
    const bytes = await fetchBytes('/model/model.fp16.onnx', onProgress);

    onProgress('compiling');
    const nlp = await NlpGraph.load({
      model: bytes,
      config: '/model/config.json',
      tokenizer: tokenizer as unknown as Parameters<typeof NlpGraph.load>[0]['tokenizer'],
      executionProviders: ['wasm'],
    });

    onProgress('ready');
    return { parser: nlp as unknown as Parser, model };
  })());
}
