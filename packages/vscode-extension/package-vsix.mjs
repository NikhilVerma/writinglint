import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVSIX } from '@vscode/vsce';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(join(here, 'package.json'), 'utf8'));
const platform = process.platform === 'win32' ? 'win32' : process.platform;
const architecture = process.arch === 'arm' && platform === 'linux' ? 'armhf' : process.arch;
const target = `${platform}-${architecture}`;
const supported = new Set([
  'darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-armhf', 'linux-x64',
  'win32-arm64', 'win32-x64',
]);
if (!supported.has(target)) throw new Error(`Unsupported VS Code extension target: ${target}`);

await createVSIX({
  cwd: here,
  dependencies: false,
  target,
  packagePath: join(here, `${manifest.name}-${manifest.version}-${target}.vsix`),
});
