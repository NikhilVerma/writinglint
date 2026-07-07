/**
 * Bundle the browser demo with esbuild (not Vite). Two entries: the UI (app.js) and
 * the linter worker (worker.js, the ONNX parse + rules + score). The demo renders its
 * own annotated manuscript, so there's no code editor and no Monaco.
 */
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)); // packages/web
const empty = join(root, 'src', 'client', 'empty.js');

/** Shared esbuild options (imported by dev.mjs too). */
export const options = {
  entryPoints: {
    app: join(root, 'src', 'client', 'app.ts'),
    worker: join(root, 'src', 'client', 'worker.ts'), // linter engine (ONNX parse + rules + score)
  },
  outdir: join(root, 'public'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  conditions: ['browser', 'import', 'module', 'default'],
  mainFields: ['browser', 'module', 'main'],
  sourcemap: true,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
  // transformers.js references these node-only backends but never reaches them in
  // the browser (we use only its tokenizer). Stub them so bundling succeeds.
  alias: {
    'onnxruntime-node': empty,
    sharp: empty,
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await build({ ...options, minify: true });
  console.log('Built public/app.js');
}
