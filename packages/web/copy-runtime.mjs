/** Stage the deployable INT8 parser, tokenizer, classifier, and WASM runtime. */
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, '..', '..');
const modelDst = join(root, 'public', 'model');
const ortDst = join(root, 'public', 'ort');
const classifier = join(repoRoot, 'packages', 'rulepack-ai-style', 'model', 'classifier.json');
const parserModel = join(repoRoot, 'models', 'rule-family-50-onnx-int8');
const ortDist = join(repoRoot, 'node_modules', 'onnxruntime-web', 'dist');

rmSync(modelDst, { recursive: true, force: true });
rmSync(ortDst, { recursive: true, force: true });
mkdirSync(modelDst, { recursive: true });
mkdirSync(ortDst, { recursive: true });
if (!existsSync(parserModel)) {
  console.error('INT8 parser bundle not found at models/rule-family-50-onnx-int8.');
  process.exit(1);
}
for (const name of ['parser.onnx', 'relations.onnx', 'manifest.json']) {
  copyFileSync(join(parserModel, name), join(modelDst, name));
}
cpSync(join(parserModel, 'tokenizer'), join(modelDst, 'tokenizer'), { recursive: true });
for (const name of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  copyFileSync(join(ortDist, name), join(ortDst, name));
}
if (existsSync(classifier)) {
  copyFileSync(classifier, join(modelDst, 'classifier.json'));
  console.log('Staged the INT8 parser, tokenizer, WASM runtime, and classifier.');
} else {
  console.error('classifier.json not found — run `npm run train` first.');
  process.exit(1);
}
