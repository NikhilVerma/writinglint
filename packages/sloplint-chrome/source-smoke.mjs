import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Expected Manifest V3.');
if (manifest.background?.type !== 'module') throw new Error('Expected a module service worker.');
if (!manifest.content_security_policy?.extension_pages.includes('wasm-unsafe-eval')) {
  throw new Error('WASM CSP is missing.');
}
if (JSON.stringify(manifest.permissions) !== JSON.stringify(['storage'])) {
  throw new Error('Review any new extension permission before adding it.');
}
const requestFiles = [
  join(root, 'src/background.ts'),
  join(root, 'src/browser-engine.ts'),
  join(root, 'src/content.ts'),
];
const source = (await Promise.all(requestFiles.map((file) => readFile(file, 'utf8')))).join('\n');
if (/(?:fetch|import)\(\s*["']https?:\/\//.test(source)) {
  throw new Error('Extension source attempts to load a remote resource.');
}
console.log('Chrome extension source smoke check passed (MV3, one permission, local resources only).');
