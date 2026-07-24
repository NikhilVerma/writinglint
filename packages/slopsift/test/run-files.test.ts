import assert from 'node:assert/strict';
import test from 'node:test';
import type { SlopSiftResult } from '../src/index.js';
import { lintFiles } from '../src/run-files.js';

test('a per-file runtime error is structured without discarding later results', async () => {
  const engine = {
    async lintSource(_file: string, source: string): Promise<SlopSiftResult> {
      if (source === 'bad') throw new Error('synthetic parser failure');
      return { kind: 'prose', wordCount: 1, lints: [] };
    },
  };
  const { results, runtimeFailures } = await lintFiles(
    engine,
    ['/tmp/bad.md', '/tmp/good.md'],
    {
      level: 'warning',
      explicitlySelectedFiles: new Set(['/tmp/bad.md', '/tmp/good.md']),
      cwd: '/tmp',
      readSource: async (file) => file.includes('bad') ? 'bad' : 'good',
    },
  );

  assert.equal(runtimeFailures, 1);
  assert.equal(results.length, 2);
  assert.equal(results[0]?.messages[0]?.ruleId, 'slopsift/runtime-error');
  assert.equal(results[0]?.messages[0]?.line, 1);
  assert.equal(results[1]?.filePath, 'good.md');
  assert.equal(results[1]?.wordCount, 1);
});
