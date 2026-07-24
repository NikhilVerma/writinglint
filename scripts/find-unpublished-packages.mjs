import { appendFile, readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDirectory = join(root, 'packages');
const candidates = [];

for (const directory of await readdir(packagesDirectory)) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(packagesDirectory, directory, 'package.json'), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') continue;
    throw error;
  }
  if (manifest.private === true || !manifest.name || !manifest.version) continue;
  candidates.push({ name: manifest.name, version: manifest.version });
}

const states = await Promise.all(candidates.map(async ({ name, version }) => {
  const encodedName = name.replace('/', '%2f');
  const response = await fetch(`https://registry.npmjs.org/${encodedName}/${version}`, {
    headers: { accept: 'application/json' },
  });
  if (response.status === 200) return { name, version, published: true };
  if (response.status === 404) return { name, version, published: false };
  throw new Error(`npm registry returned ${response.status} for ${name}@${version}`);
}));

const unpublished = states.filter(({ published }) => !published);
const needed = unpublished.length > 0;
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `needed=${needed}\n`);
}

if (needed) {
  console.log(`Unpublished public packages: ${unpublished.map(({ name, version }) => `${name}@${version}`).join(', ')}`);
} else {
  console.log(`All ${states.length} public package versions are already published; skipping release-only work.`);
}
