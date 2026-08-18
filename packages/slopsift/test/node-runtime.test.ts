import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../..', import.meta.url));

const readJson = async (path: string): Promise<{
  engines?: { node?: string };
  devDependencies?: { '@types/node'?: string };
}> => JSON.parse(await readFile(join(root, path), 'utf8')) as {
  engines?: { node?: string };
  devDependencies?: { '@types/node'?: string };
};

test('repository and published packages use Node.js 24', async () => {
  const rootManifest = await readJson('package.json');
  assert.equal(rootManifest.engines?.node, '>=24.0.0');
  assert.match(rootManifest.devDependencies?.['@types/node'] ?? '', /^\^24\./);
  assert.equal((await readFile(join(root, '.nvmrc'), 'utf8')).trim(), '24');

  const runtimePackages = [
    'packages/cli/package.json',
    'packages/core/package.json',
    'packages/parser-node/package.json',
    'packages/rulepack-ai-style/package.json',
    'packages/rulepack-craft/package.json',
    'packages/rulepack-reader-first/package.json',
    'packages/slopsift/package.json',
  ];
  for (const path of runtimePackages) {
    const manifest = await readJson(path);
    assert.equal(manifest.engines?.node, '>=24', `${path} has a different Node.js runtime`);
  }

  const extensionManifest = await readJson('packages/vscode-extension/package.json');
  assert.match(extensionManifest.devDependencies?.['@types/node'] ?? '', /^\^24\./);
});

test('every Node.js workflow uses version 24', async () => {
  const workflowDirectory = join(root, '.github/workflows');
  const workflows = await readdir(workflowDirectory);
  let nodeWorkflowCount = 0;

  for (const name of workflows) {
    if (!name.endsWith('.yml') && !name.endsWith('.yaml')) continue;
    const source = await readFile(join(workflowDirectory, name), 'utf8');
    const setupCount = source.match(/uses: actions\/setup-node@/g)?.length ?? 0;
    if (setupCount === 0) continue;
    nodeWorkflowCount += 1;
    assert.equal(source.match(/node-version:\s*24\b/g)?.length, setupCount, `${name} uses another Node.js version`);
  }

  assert.ok(nodeWorkflowCount >= 5, 'expected the maintained Node.js workflows');
});

test('maintained setup instructions require Node.js 24', async () => {
  const paths = [
    'README.md',
    'CONTRIBUTING.md',
    'skills/slopsift/SKILL.md',
    'packages/slopsift-web/public/llms-full.txt',
    'packages/slopsift-web/public/markdown/docs.md',
  ];

  for (const path of paths) {
    const source = await readFile(join(root, path), 'utf8');
    assert.match(source, /Node\.js 24/, `${path} does not name the supported runtime`);
    assert.doesNotMatch(source, /Node\.js (?:18|20|22)\b/, `${path} advertises an old runtime`);
  }
});
