import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['packed', 'published', 'published-writinglint'].includes(mode)) {
  throw new Error('usage: node scripts/smoke-cli-install.mjs packed|published|published-writinglint');
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageName = mode === 'published-writinglint' ? 'writinglint' : 'sloplint';
const packageDirectory = packageName === 'writinglint' ? 'cli' : 'sloplint';
const source = join(root, `examples/${packageName}-npm-smoke`);
const temporary = await mkdtemp(join(tmpdir(), `sloplint-${mode}-`));
const consumer = join(temporary, 'consumer');
await cp(source, consumer, { recursive: true });

const manifestPath = join(consumer, 'package.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const expected = JSON.parse(await readFile(join(root, `packages/${packageDirectory}/package.json`), 'utf8')).version;

function runNpm(args, options = {}) {
  return spawnSync('npm', args, {
    cwd: consumer,
    encoding: 'utf8',
    env: { ...process.env, npm_config_workspaces: 'false' },
    timeout: 120_000,
    ...options,
  });
}

try {
  if (mode === 'packed') {
    const tarballs = join(temporary, 'tarballs');
    await mkdir(tarballs);
    execFileSync('npm', ['run', 'setup-model'], {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    });
    execFileSync('npm', ['run', 'build:libs'], {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    });
    manifest.dependencies = {};
    for (const name of [
      'writinglint-core',
      'writinglint-parser-node',
      'writinglint-rulepack-ai-style',
      'sloplint',
    ]) {
      const output = execFileSync('npm', [
        'pack', '--json', '--ignore-scripts', '--pack-destination', tarballs, '--workspace', name,
      ], {
        cwd: root,
        encoding: 'utf8',
        env: process.env,
      });
      const [{ filename }] = JSON.parse(output);
      manifest.dependencies[name] = `file:${join(tarballs, basename(filename))}`;
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } else {
    manifest.dependencies = { [packageName]: expected };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    let visible = false;
    for (let attempt = 1; attempt <= 20; attempt++) {
      const lookup = runNpm(['view', `${packageName}@${expected}`, 'version', '--json'], { timeout: 15_000 });
      if (lookup.status === 0 && JSON.parse(lookup.stdout) === expected) {
        visible = true;
        break;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 3_000));
    }
    if (!visible) throw new Error(`${packageName}@${expected} did not become visible on npm`);
  }

  let installation;
  const attempts = 2;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    installation = runNpm([
      'install',
      '--no-audit',
      '--no-fund',
      '--fetch-retries=2',
      '--fetch-retry-mintimeout=1000',
      '--fetch-retry-maxtimeout=5000',
      '--fetch-timeout=60000',
    ]);
    if (installation.status === 0) break;
    if (attempt === attempts) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 3_000));
  }
  if (installation?.status !== 0) {
    throw new Error(`isolated npm install failed:\n${installation?.stdout ?? ''}\n${installation?.stderr ?? ''}`);
  }

  const verification = runNpm(['test'], {
    env: {
      ...process.env,
      npm_config_workspaces: 'false',
      EXPECTED_PACKAGE_VERSION: expected,
    },
  });
  if (verification.status !== 0) {
    throw new Error(`isolated ${packageName} verification failed:\n${verification.stdout}\n${verification.stderr}`);
  }
  process.stdout.write(verification.stdout);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
