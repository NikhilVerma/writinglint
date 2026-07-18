import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const missing = '__slopsift_intentionally_missing__/**/*.md';
const sloppy = fileURLToPath(new URL('./fixtures/high-confidence.md', import.meta.url));

function run(...args: string[]) {
  return spawnSync(process.execPath, ['--conditions=source', '--import', 'tsx', cli, ...args], {
    encoding: 'utf8',
  });
}

test('unmatched patterns fail loudly by default', () => {
  const result = run(missing);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no supported files matched/);
  assert.match(result.stderr, /--no-error-on-unmatched-pattern/);
});

test('unmatched patterns can be optional without loading the model', () => {
  const result = run(missing, '--no-error-on-unmatched-pattern', '--format', 'json');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
});

test('exit-zero neutralizes lint findings but not runtime failures', () => {
  const failing = run(sloppy, '--level', 'error');
  assert.equal(failing.status, 1, failing.stderr);

  const advisory = run(sloppy, '--level', 'error', '--exit-zero');
  assert.equal(advisory.status, 0, advisory.stderr);
  assert.match(advisory.stdout, /error/);

  const runtimeFailure = run(missing, '--exit-zero');
  assert.equal(runtimeFailure.status, 2);
});
