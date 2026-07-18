import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Lint } from 'writinglint-core';
import { jsonResult, makeResult, stylish } from '../src/format.js';

const lint = (severity: Lint['severity'], confidence: Lint['confidence'], start: number): Lint => ({
  ruleId: `ai-style/${severity}`,
  category: 'test',
  severity,
  confidence,
  start,
  end: start + 4,
  text: 'slop',
  message: `${confidence} confidence`,
});

test('result counts all three levels and stylish reports them', () => {
  const result = makeResult('sample.md', 'slop slop slop', [
    lint('error', 'high', 0),
    lint('warn', 'medium', 5),
    lint('info', 'low', 10),
  ]);
  assert.deepEqual(
    { errors: result.errorCount, warnings: result.warningCount, info: result.infoCount },
    { errors: 1, warnings: 1, info: 1 },
  );
  assert.match(stylish([result]), /3 findings \(1 errors, 1 warnings, 1 info\)/);
});

test('JSON uses ESLint numeric severity while retaining level and confidence', () => {
  const result = jsonResult(makeResult('sample.md', 'slop', [lint('error', 'high', 0)])) as {
    messages: Array<{ severity: number; level: string; confidence: string }>;
  };
  assert.equal(result.messages[0]?.severity, 2);
  assert.equal(result.messages[0]?.level, 'error');
  assert.equal(result.messages[0]?.confidence, 'high');
});
