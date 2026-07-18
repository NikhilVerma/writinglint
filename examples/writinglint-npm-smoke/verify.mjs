import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const modules = join(root, 'node_modules');
const installed = JSON.parse(await readFile(join(modules, 'writinglint/package.json'), 'utf8'));
if (process.env.EXPECTED_PACKAGE_VERSION) {
  assert.equal(installed.version, process.env.EXPECTED_PACKAGE_VERSION);
}

for (const name of ['writinglint', 'writinglint-core', 'writinglint-parser-node']) {
  const manifest = JSON.parse(await readFile(join(modules, name, 'package.json'), 'utf8'));
  for (const specifier of Object.values(manifest.dependencies ?? {})) {
    assert.doesNotMatch(specifier, /^(?:file:|link:|workspace:)/, `${name} must use registry dependencies`);
  }
}
assert.equal((await stat(join(modules, 'writinglint-parser-node/model/parser.onnx'))).size, 11_877_081);

const executable = join(modules, '.bin', process.platform === 'win32' ? 'writinglint.cmd' : 'writinglint');
const version = spawnSync(executable, ['--version'], { cwd: root, encoding: 'utf8' });
assert.equal(version.status, 0, version.stderr);
assert.equal(version.stdout.trim(), installed.version);

const result = spawnSync(executable, ['sloppy.md', '--json'], { cwd: root, encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr);
const report = JSON.parse(result.stdout);
assert.equal(report.file, 'sloppy.md');
assert.ok(report.lints.some((lint) => lint.ruleId === 'ai-style/emerging-slop-phrases'));

console.log(`Verified writinglint@${installed.version} from npm with registry-only dependencies (${report.lints.length} findings).`);
