import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const repository = 'git+https://github.com/NikhilVerma/writinglint.git';
const npmCache = resolve(tmpdir(), 'writinglint-pack-check-cache');
const packagedProjects = [
  'writinglint-core',
  'writinglint-parser-node',
  'writinglint-rulepack-ai-style',
  'writinglint-rulepack-craft',
  'writinglint',
  'slopsift',
];

function fail(message) {
  throw new Error(message);
}

function packageManifest(name) {
  const workspaceJson = execFileSync(
    'npm',
    ['query', `.workspace[name="${name}"]`, '--json'],
    { cwd: root, encoding: 'utf8' },
  );
  const [workspace] = JSON.parse(workspaceJson);
  if (!workspace) fail(`workspace ${name} was not found`);
  return {
    directory: workspace.location,
    manifest: JSON.parse(readFileSync(resolve(root, workspace.location, 'package.json'), 'utf8')),
  };
}

function collectTargets(value, targets = new Set()) {
  if (typeof value === 'string') targets.add(value.startsWith('./') ? value.slice(2) : value);
  else if (Array.isArray(value)) for (const entry of value) collectTargets(entry, targets);
  else if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectTargets(entry, targets);
  }
  return targets;
}

for (const name of packagedProjects) {
  const { directory, manifest } = packageManifest(name);
  const expectedPrivate = name === 'writinglint';
  if (Boolean(manifest.private) !== expectedPrivate) {
    fail(`${name} must be ${expectedPrivate ? 'private until its first npm release' : 'public'}`);
  }
  if (manifest.license !== 'MIT') fail(`${name} must declare the MIT license`);
  if (manifest.repository?.url !== repository) fail(`${name} has an incorrect repository URL`);
  if (manifest.repository?.directory !== directory) fail(`${name} has an incorrect repository.directory`);
  if (manifest.bugs?.url !== 'https://github.com/NikhilVerma/writinglint/issues') fail(`${name} has an incorrect bugs URL`);
  if (!manifest.homepage) fail(`${name} is missing a homepage`);
  if (!manifest.private && manifest.publishConfig?.access !== 'public') fail(`${name} must publish as public`);
  if (!manifest.engines?.node) fail(`${name} is missing engines.node`);
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) fail(`${name} needs an explicit files allowlist`);

  const raw = execFileSync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts', '--cache', npmCache, '--workspace', name],
    { cwd: root, encoding: 'utf8' },
  );
  const [packed] = JSON.parse(raw);
  const files = new Map(packed.files.map((file) => [file.path, file]));
  for (const required of ['package.json', 'README.md', 'LICENSE']) {
    if (!files.has(required)) fail(`${name} tarball is missing ${required}`);
  }
  if (name === 'writinglint-parser-node') {
    const modelFiles = {
      'model/manifest.json': 2032,
      'model/parser.onnx': 11877081,
      'model/relations.onnx': 3400279,
      'model/tokenizer/tokenizer.json': 711396,
      'model/tokenizer/tokenizer_config.json': 378,
    };
    for (const [path, bytes] of Object.entries(modelFiles)) {
      const packaged = files.get(path);
      if (!packaged) fail(`${name} tarball is missing bundled ${path}`);
      if (packaged.size !== bytes) fail(`${name} bundled ${path} has an unexpected byte count`);
    }
  }

  const readme = readFileSync(resolve(root, directory, 'README.md'), 'utf8');
  for (const match of readme.matchAll(/\]\(\.\/([^\s)#?]+)(?:[?#][^)]*)?\)/g)) {
    const linked = decodeURIComponent(match[1]);
    if (!files.has(linked)) fail(`${name} README links to ${linked}, which is absent from its tarball`);
  }

  const targets = collectTargets({
    main: manifest.main,
    module: manifest.module,
    types: manifest.types,
    bin: manifest.bin,
    exports: manifest.exports,
  });
  for (const target of targets) {
    if (!files.has(target)) fail(`${name} entry point ${target} is absent from its tarball`);
  }

  for (const path of files.keys()) {
    if (
      /(^|\/)(?:\.env(?:\.|$)|\.DS_Store$|test(?:s)?\/|eval\/|training\/)/.test(path) ||
      /(?:\.log|\.tgz)$/.test(path)
    ) {
      fail(`${name} tarball includes forbidden file ${path}`);
    }
  }

  for (const target of collectTargets(manifest.bin)) {
    const packedMode = files.get(target)?.mode ?? 0;
    if ((packedMode & 0o111) === 0) fail(`${name} binary ${target} is not executable in the tarball`);
    const firstLine = readFileSync(resolve(root, directory, target), 'utf8').split('\n', 1)[0];
    if (firstLine !== '#!/usr/bin/env node') fail(`${name} binary ${target} has no Node.js shebang`);
  }

  console.log(`✓ ${packed.id}: ${packed.entryCount} files, ${packed.size} bytes`);
}

// A version command must not initialize the parser or download a model.
for (const [name, file] of [
  ['writinglint', 'packages/cli/dist/cli.js'],
  ['slopsift', 'packages/slopsift/dist/cli.js'],
]) {
  const output = execFileSync(process.execPath, [resolve(root, file), '--version'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5_000,
  }).trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(output)) {
    fail(`${name} --version returned ${JSON.stringify(output)}`);
  }
  console.log(`✓ ${name} --version (${output})`);
}
