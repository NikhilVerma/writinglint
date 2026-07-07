/**
 * Dev server: stage runtime assets, bundle with esbuild in watch mode, and serve
 * public/ (SPA) at http://localhost:5173.
 */
import { context } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { options } from './build-client.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5173;

// Ensure public/model + public/ort exist before serving.
spawnSync(process.execPath, [join(root, 'copy-runtime.mjs')], { stdio: 'inherit' });

const ctx = await context({ ...options, minify: false });
await ctx.watch();
const { host, port } = await ctx.serve({ servedir: join(root, 'public'), host: '127.0.0.1', port: PORT });

const url = `http://localhost:${port}`;
console.log(`\n  Better Write dev server → ${url}   (host ${host})\n`);
