import assert from 'node:assert/strict';
import test from 'node:test';
import type { Parser } from 'writinglint-core';
import { SlopSift } from '../src/index.js';

const parser: Parser = {
  async parse() { return []; },
};

test('programmatic API reports unsupported inputs without invoking a CLI', async () => {
  const linter = new SlopSift(parser);
  assert.equal(linter.supports('README.md'), true);
  assert.equal(linter.supports('image.png'), false);
  assert.equal(await linter.lintSource('image.png', 'revolutionary'), undefined);
});

test('programmatic API lints supported source in process', async () => {
  const linter = new SlopSift(parser);
  const result = await linter.lintSource('README.md', 'Plain prose.', { level: 'info' });
  assert.equal(result?.kind, 'prose');
  assert.equal(result?.wordCount, 2);
  assert.deepEqual(result?.lints, []);
});

test('an empty technical-English run still reports that review is required', async () => {
  const linter = new SlopSift(parser);
  const result = await linter.lintSource('README.md', '', { rulepacks: ['asd-ste100'] });
  assert.equal(result?.standardAssessment?.status, 'review-required');
  assert.equal(result?.standardAssessment?.automatedRuleFindings, 0);
});

test('source metrics count extracted comments rather than code tokens', async () => {
  const linter = new SlopSift(parser);
  const result = await linter.lintSource('example.ts', 'const implementationToken = 1; // Review this sentence.');
  assert.equal(result?.wordCount, 3);
});

test('technical comments suppress paragraph-level semantic redundancy', async () => {
  const linter = new SlopSift(parser);
  const first = 'The registry replaces raw database identifiers with short references that the model can safely return.';
  const second = 'Short references replace raw database identifiers, allowing the model to return safe registry values.';
  const prose = await linter.lintSource('README.md', `${first}\n\n${second}`, { level: 'info' });
  assert.ok(prose?.lints.some((lint) => lint.ruleId === 'ai-style/semantic-redundancy'));

  const comments = await linter.lintSource('state-machine.ts', `// ${first}\n\n// ${second}`, { level: 'info' });
  assert.ok(!comments?.lints.some((lint) => lint.ruleId === 'ai-style/semantic-redundancy'));
});
