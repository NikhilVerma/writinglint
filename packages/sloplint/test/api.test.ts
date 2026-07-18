import assert from 'node:assert/strict';
import test from 'node:test';
import type { Parser } from 'writinglint-core';
import { Sloplint } from '../src/index.js';

const parser: Parser = {
  async parse() { return []; },
};

test('programmatic API reports unsupported inputs without invoking a CLI', async () => {
  const linter = new Sloplint(parser);
  assert.equal(linter.supports('README.md'), true);
  assert.equal(linter.supports('image.png'), false);
  assert.equal(await linter.lintSource('image.png', 'revolutionary'), undefined);
});

test('programmatic API lints supported source in process', async () => {
  const linter = new Sloplint(parser);
  const result = await linter.lintSource('README.md', 'Plain prose.', { level: 'info' });
  assert.equal(result?.kind, 'prose');
  assert.deepEqual(result?.lints, []);
});
