import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVSIX } from '@vscode/vsce';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(join(here, 'package.json'), 'utf8'));
const platform = process.platform === 'win32' ? 'win32' : process.platform;
const architecture = process.arch === 'arm' && platform === 'linux' ? 'armhf' : process.arch;
const supported = new Set([
  'darwin-arm64', 'linux-arm64', 'linux-x64',
  'win32-arm64', 'win32-x64',
]);

const arguments_ = process.argv.slice(2);
const targetArguments = arguments_.flatMap((argument, index) => {
  if (argument === '--target') return arguments_[index + 1] ? [arguments_[index + 1]] : [];
  if (argument.startsWith('--target=')) return [argument.slice('--target='.length)];
  return [];
});
const localTarget = `${platform}-${architecture}`;
const allTargets = [
  ...[...supported].filter((target) => target !== localTarget),
  ...(supported.has(localTarget) ? [localTarget] : []),
];
const targets = arguments_.includes('--all')
  ? allTargets
  : targetArguments.length > 0
    ? targetArguments
    : [localTarget];

for (const target of targets) {
  if (!supported.has(target)) {
    throw new Error(`Unsupported VS Code extension target: ${target}. Supported targets: ${[...supported].join(', ')}`);
  }
  process.env.SLOPSIFT_VSCODE_TARGET = target;
  await createVSIX({
    cwd: here,
    dependencies: false,
    target,
    packagePath: join(here, `${manifest.name}-${manifest.version}-${target}.vsix`),
  });
}
