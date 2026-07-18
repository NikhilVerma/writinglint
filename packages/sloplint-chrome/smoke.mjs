import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINNED_MANIFEST_SHA256, verifyModel } from './model-integrity.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, 'dist');
const required = [
  'manifest.json', 'background.js', 'content.js', 'popup.html', 'popup.js', 'popup.css',
  'model/manifest.json', 'model/parser.onnx', 'model/relations.onnx', 'model/tokenizer/tokenizer.json',
  'ort/ort-wasm-simd-threaded.wasm', 'ort/ort-wasm-simd-threaded.mjs',
];
await Promise.all(required.map((file) => access(join(out, file))));
const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Expected Manifest V3.');
if (manifest.background?.type !== 'module') throw new Error('Expected a module service worker.');
if (!manifest.content_security_policy?.extension_pages.includes('wasm-unsafe-eval')) {
  throw new Error('WASM CSP is missing.');
}
const background = await readFile(join(out, 'background.js'), 'utf8');
// ONNX Runtime carries license and troubleshooting URLs as inert strings. Fail
// only when executable code tries to fetch or import a remote script/resource.
if (/(?:fetch|import)\(\s*["']https?:\/\//.test(background)) {
  throw new Error('The background bundle attempts to load an unexpected remote URL.');
}
const { manifest: modelManifest } = await verifyModel(join(out, 'model'), {
  pinnedManifest: PINNED_MANIFEST_SHA256,
});
const parserBytes = modelManifest.artifacts['parser.onnx'].bytes;
console.log(`Chrome extension smoke check passed (${(parserBytes / 1_000_000).toFixed(1)} MB verified parser).`);
