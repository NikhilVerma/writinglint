/**
 * Bundle the browser app (src/web/main.ts → public/app.js + app.css) with esbuild.
 * Follows nlpgraph's browser convention: esbuild (not Vite), onnxruntime-web on WASM.
 */
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const empty = join(root, 'src', 'web', 'empty.js');

/** Shared esbuild options (imported by dev.mjs too). */
export const options = {
  entryPoints: [join(root, 'src', 'web', 'main.ts')],
  outfile: join(root, 'public', 'app.js'),
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
