import { execFileSync } from 'node:child_process';
import { appendFile, readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDirectory = join(root, 'packages');
const eventName = process.env.GITHUB_EVENT_NAME;
const before = process.env.GITHUB_EVENT_BEFORE;
const zeroSha = /^0+$/;
const changes = [];

for (const directory of await readdir(packagesDirectory)) {
  const manifestPath = join(packagesDirectory, directory, 'package.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') continue;
    throw error;
  }
  if (manifest.private === true || !manifest.name || !manifest.version) continue;

  if (eventName === 'workflow_dispatch' || !before || zeroSha.test(before)) {
    changes.push(`${manifest.name}@${manifest.version}`);
    continue;
  }

  let previous;
  try {
    previous = JSON.parse(execFileSync(
      'git',
      ['show', `${before}:${relative(root, manifestPath)}`],
      { cwd: root, encoding: 'utf8' },
    ));
  } catch {
    changes.push(`${manifest.name}@${manifest.version}`);
    continue;
  }
  if (previous.version !== manifest.version) {
    changes.push(`${manifest.name}: ${previous.version ?? 'unversioned'} -> ${manifest.version}`);
  }
}

const needed = changes.length > 0;
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `needed=${needed}\n`);
}

if (needed) {
  console.log(`Public package release required: ${changes.join(', ')}`);
} else {
  console.log('No public package version changed; skipping release-only work.');
}
