import { execFileSync, spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDirectory = join(root, 'packages');
const verifyRemote = process.argv.includes('--verify-remote');
const tags = [];

for (const directory of await readdir(packagesDirectory)) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(packagesDirectory, directory, 'package.json'), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') continue;
    throw error;
  }
  if (manifest.private === true || !manifest.name || !manifest.version) continue;
  tags.push(`${manifest.name}@${manifest.version}`);
}

if (verifyRemote) {
  const output = execFileSync('git', ['ls-remote', '--tags', 'origin'], {
    cwd: root,
    encoding: 'utf8',
  });
  const remote = new Set(output.trim().split('\n').filter(Boolean).map((line) => line.split(/\s+/)[1]));
  const missing = tags.filter((tag) => !remote.has(`refs/tags/${tag}`));
  if (missing.length) throw new Error(`release tags missing from origin: ${missing.join(', ')}`);
  console.log(`Verified ${tags.length} public-package tags on origin.`);
} else {
  for (const tag of tags) {
    const exists = spawnSync('git', ['rev-parse', '--quiet', '--verify', `refs/tags/${tag}`], {
      cwd: root,
      stdio: 'ignore',
    }).status === 0;
    if (exists) continue;
    execFileSync('git', ['tag', tag], { cwd: root });
    console.log(`Created missing release tag ${tag}.`);
  }
}
