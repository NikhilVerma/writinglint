import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const installed = JSON.parse(await readFile(join(root, 'node_modules/slopsift/package.json'), 'utf8'));
if (process.env.EXPECTED_PACKAGE_VERSION) {
  assert.equal(installed.version, process.env.EXPECTED_PACKAGE_VERSION);
}

const installedParser = JSON.parse(await readFile(join(root, 'node_modules/writinglint-parser-node/package.json'), 'utf8'));
if (process.env.EXPECTED_PARSER_VERSION) {
  assert.equal(installedParser.version, process.env.EXPECTED_PARSER_VERSION);
}

const parser = join(root, 'node_modules/writinglint-parser-node/model/parser.onnx');
assert.equal((await stat(parser)).size, 11_877_081, 'the transitive npm package must contain the parser');

const cli = join(root, 'node_modules/slopsift/dist/cli.js');
const result = spawnSync(process.execPath, [
  cli,
  'sloppy.md',
  '--level', 'info',
  '--format', 'json',
  '--no-download',
], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    XDG_CACHE_HOME: join(root, '.empty-cache'),
    SLOPSIFT_MODEL_BASE_URL: 'http://127.0.0.1:9',
  },
});

assert.ok(result.status === 0 || result.status === 1, result.stderr || `unexpected exit ${result.status}`);
const reports = JSON.parse(result.stdout);
assert.equal(reports.length, 1);
const emerging = reports[0].messages.filter((message) => message.ruleId === 'ai-style/emerging-slop-phrases');
assert.equal(emerging.length, 2, 'expected the emerging phrases, but not the literal load-bearing wall');
assert.ok(emerging.every((message) => message.level === 'info' && message.confidence === 'low'));

console.log(`Verified slopsift@${installed.version} as an isolated npm consumer (${reports[0].messages.length} findings).`);
