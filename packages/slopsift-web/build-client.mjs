import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const empty = join(root, 'src', 'client', 'empty.js');

await build({
  entryPoints: {
    demo: join(root, 'src', 'client', 'demo.ts'),
    brain: join(root, 'src', 'client', 'brain.ts'),
    editor: join(root, 'src', 'client', 'editor.ts'),
    'slop-worker': join(root, 'src', 'client', 'worker.ts'),
  },
  outdir: join(root, 'public'),
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  conditions: ['source', 'browser', 'import', 'module', 'default'],
  mainFields: ['browser', 'module', 'main'],
  sourcemap: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: { 'onnxruntime-node': empty, sharp: empty },
});
