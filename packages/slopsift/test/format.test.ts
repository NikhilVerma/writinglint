import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Lint } from 'writinglint-core';
import { github, jsonResult, makeResult, stylish } from '../src/format.js';

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
    { errors: result.errorCount, warnings: result.warningCount, info: result.infoCount, words: result.wordCount, density: result.findingsPerThousandWords },
    { errors: 1, warnings: 1, info: 1, words: 3, density: 1000 },
  );
  assert.match(stylish([result]), /3 findings \(1 error, 1 warning, 1 info\)/);
});

test('JSON uses ESLint numeric severity while retaining level and confidence', () => {
  const result = jsonResult(makeResult('sample.md', 'slop', [lint('error', 'high', 0)])) as {
    messages: Array<{ severity: number; level: string; confidence: string; ruleUrl: string }>;
    wordCount: number;
    findingsPerThousandWords: number;
  };
  assert.equal(result.messages[0]?.severity, 2);
  assert.equal(result.messages[0]?.level, 'error');
  assert.equal(result.messages[0]?.confidence, 'high');
  assert.equal(result.messages[0]?.ruleUrl, 'https://slopsift.dev/rules/error/');
  assert.equal(result.wordCount, 1);
  assert.equal(result.findingsPerThousandWords, 1000);
});

test('GitHub output emits escaped workflow annotations', () => {
  const result = makeResult('docs/draft,one.md', 'slop', [{
    ...lint('warn', 'medium', 0),
    ruleId: 'ai-style/test:rule',
    message: 'First line\nsecond line',
  }]);
  assert.equal(
    github([result]),
    '::warning file=docs/draft%2Cone.md,line=1,col=1,endLine=1,endColumn=5,title=ai-style/test%3Arule::First line%0Asecond line',
  );
});
