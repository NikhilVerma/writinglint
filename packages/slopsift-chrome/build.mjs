import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINNED_MANIFEST_SHA256, verifyModel } from './model-integrity.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const out = join(root, 'dist');
const model = process.env.SLOPSIFT_MODEL ?? join(repo, 'packages/parser-node/model');
const requiredModelFiles = [
  'manifest.json',
  'parser.onnx',
  'relations.onnx',
  'tokenizer/tokenizer.json',
  'tokenizer/tokenizer_config.json',
];

for (const file of requiredModelFiles) {
  if (!existsSync(join(model, file))) {
    throw new Error(`Missing ${join(model, file)}. Set SLOPSIFT_MODEL to an INT8 model bundle.`);
  }
}
await verifyModel(model, {
  pinnedManifest: process.env.SLOPSIFT_MODEL ? undefined : PINNED_MANIFEST_SHA256,
});

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'model/tokenizer'), { recursive: true });
await mkdir(join(out, 'ort'), { recursive: true });

await build({
  entryPoints: {
    background: join(root, 'src/background.ts'),
    content: join(root, 'src/content.ts'),
    popup: join(root, 'src/popup.ts'),
  },
  outdir: out,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome105'],
  conditions: ['source', 'browser', 'import', 'module', 'default'],
  mainFields: ['browser', 'module', 'main'],
  minify: true,
  sourcemap: false,
  define: { 'process.env.NODE_ENV': '"production"' },
});

await Promise.all([
  cp(join(root, 'popup.html'), join(out, 'popup.html')),
  cp(join(root, 'popup.css'), join(out, 'popup.css')),
  ...requiredModelFiles.map((file) => cp(join(model, file), join(out, 'model', file))),
  cp(
    join(repo, 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'),
    join(out, 'ort/ort-wasm-simd-threaded.wasm'),
  ),
  cp(
    join(repo, 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs'),
    join(out, 'ort/ort-wasm-simd-threaded.mjs'),
  ),
]);

const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
manifest.version = packageJson.version;
await writeFile(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Built ${out}`);
