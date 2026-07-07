/**
 * Node-side parser loader (eval, CLI, tests). Loads the vendored xsmall model
 * from ./models/xsmall (populated by `npm run download-model`). Kept in its own
 * module so the browser bundle never imports onnxruntime-node.
 */
import { NlpGraph } from 'nlpgraph';
import { fileURLToPath } from 'node:url';
import type { Parser } from '@better-write/core';

let cached: Promise<Parser> | null = null;

/** Load (and memoise) the Node parser. */
export function loadParser(): Promise<Parser> {
  if (cached) return cached;
  const modelDir =
    process.env.NLPGRAPH_MODEL_DIR ??
    // repo-root/models/xsmall — from packages/parser-node/src/
    fileURLToPath(new URL('../../../models/xsmall', import.meta.url));
  cached = NlpGraph.load({ modelDir }) as Promise<Parser>;
  return cached;
}
