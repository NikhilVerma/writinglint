/**
 * Stage the static runtime assets the browser app fetches at load time:
 *   public/model/  ← the vendored parser (models/xsmall) + our classifier.json
 *   public/ort/    ← onnxruntime-web WASM kernels + worker glue
 *
 * These are gitignored (public/model, public/ort) — regenerate with `npm run copy-runtime`.
 */
import { mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const modelSrc = join(root, 'models', 'xsmall');
const modelDst = join(root, 'public', 'model');
const ortSrc = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const ortDst = join(root, 'public', 'ort');

if (!existsSync(modelSrc)) {
  console.error(`Missing ${modelSrc}. Run: npm run download-model`);
  process.exit(1);
}

mkdirSync(modelDst, { recursive: true });
// The parser needs config + both tokenizer files + the ONNX weights.
for (const f of ['model.fp16.onnx', 'config.json', 'tokenizer.json', 'tokenizer_config.json', 'vocabs.json']) {
  const src = join(modelSrc, f);
  if (existsSync(src)) copyFileSync(src, join(modelDst, f));
}
// Our data-free stylometric model (fit by `npm run train`).
const clf = join(root, 'models', 'classifier.json');
if (existsSync(clf)) copyFileSync(clf, join(modelDst, 'classifier.json'));
else console.warn('models/classifier.json not found — run `npm run train` first (score will use the heuristic fallback).');

mkdirSync(ortDst, { recursive: true });
// Copy the WASM kernels + their .mjs worker glue (ort.env.wasm.wasmPaths='/ort/').
let n = 0;
for (const f of readdirSync(ortSrc)) {
  if (f.endsWith('.wasm') || f.endsWith('.mjs')) {
    copyFileSync(join(ortSrc, f), join(ortDst, f));
    n++;
  }
}
console.log(`Staged public/model (parser + classifier) and public/ort (${n} runtime files).`);
