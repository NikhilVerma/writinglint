import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, '..', '..');
const modelSource = join(repoRoot, 'models', 'rule-family-50-onnx-int8');
const classifierSource = join(repoRoot, 'packages', 'rulepack-ai-style', 'model', 'classifier.json');
const runtimeSource = join(repoRoot, 'node_modules', 'onnxruntime-web', 'dist');
const modelTarget = join(root, 'public', 'model');
const runtimeTarget = join(root, 'public', 'ort');

if (!existsSync(modelSource)) {
  console.error('Missing models/rule-family-50-onnx-int8. See packages/sloplint/MODEL.md.');
  process.exit(1);
}

rmSync(modelTarget, { recursive: true, force: true });
rmSync(runtimeTarget, { recursive: true, force: true });
mkdirSync(modelTarget, { recursive: true });
mkdirSync(runtimeTarget, { recursive: true });

for (const name of ['parser.onnx', 'relations.onnx', 'manifest.json']) {
  copyFileSync(join(modelSource, name), join(modelTarget, name));
}
cpSync(join(modelSource, 'tokenizer'), join(modelTarget, 'tokenizer'), { recursive: true });
if (existsSync(classifierSource)) copyFileSync(classifierSource, join(modelTarget, 'classifier.json'));
else {
  console.error('Missing packages/rulepack-ai-style/model/classifier.json. Run npm run train.');
  process.exit(1);
}
for (const name of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  copyFileSync(join(runtimeSource, name), join(runtimeTarget, name));
}
