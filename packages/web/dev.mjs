/**
 * Local dev: stage the runtime assets (model + ort), run esbuild in watch mode for
 * the demo client (public/app.js + worker.js + editor.worker.js + app.css), and run
 * Astro's dev server together. Astro serves public/ statically, so the model/WASM and
 * the esbuild bundles are all same-origin — no proxy, no Cloudflare Functions.
 */
import { context } from 'esbuild';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { options } from './build-client.mjs';

const root = dirname(fileURLToPath(import.meta.url));

// Ensure public/model + public/ort exist before Astro serves them.
spawnSync(process.execPath, [join(root, 'copy-runtime.mjs')], { stdio: 'inherit' });

const ctx = await context({ ...options, minify: false });
await ctx.rebuild();
await ctx.watch();
console.log('[dev] esbuild watching src/client → public/{app,worker,editor.worker}.js');

const astro = spawn('npx', ['astro', 'dev'], { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' });

const shutdown = async () => {
  try { await ctx.dispose(); } catch {}
  astro.kill('SIGINT');
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
astro.on('exit', (code) => { ctx.dispose(); process.exit(code ?? 0); });
