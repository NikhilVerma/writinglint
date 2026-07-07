/**
 * Node-side parser loader (eval, CLI, tests). Loads the vendored xsmall model
 * from ./models/xsmall (populated by `npm run download-model`). Kept in its own
 * module so the browser bundle never imports onnxruntime-node.
 */
import { NlpGraph } from 'nlpgraph';
import { fileURLToPath } from 'node:url';
import type { Parser } from 'writinglint-core';

let cached: Promise<Parser> | null = null;

/**
 * Load (and memoise) the Node parser.
 *
 * The ~145 MB xsmall model is not bundled with this package. Point `modelDir` at a
 * downloaded copy (`npx nlpgraph download --model xsmall --dir ./models`), or set
 * NLPGRAPH_MODEL_DIR. The bare fallback only resolves inside this repo.
 */
export function loadParser(opts?: { modelDir?: string }): Promise<Parser> {
  if (cached) return cached;
  const modelDir =
    opts?.modelDir ??
    process.env.NLPGRAPH_MODEL_DIR ??
    // repo-root/models/xsmall — from packages/parser-node/{src,dist}/
    fileURLToPath(new URL('../../../models/xsmall', import.meta.url));
  cached = NlpGraph.load({ modelDir }) as Promise<Parser>;
  return cached;
}
