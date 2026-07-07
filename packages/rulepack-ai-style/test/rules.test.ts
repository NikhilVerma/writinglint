import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Linter, resolveConfig, type Lint, type ResolvedConfig } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { recommended, score } from '../src/index.js';

let linter: Linter;
let config: ResolvedConfig;

before(async () => {
  linter = new Linter(await loadParser());
  config = resolveConfig(recommended);
});

async function lint(text: string): Promise<Lint[]> {
  return (await linter.lint(text, config)).lints;
}
const fired = (lints: Lint[], rule: string) => lints.some((l) => l.ruleId === `ai-style/${rule}`);

test('corrective-antithesis fires on the "X, not Y" construction', async () => {
  assert.ok(fired(await lint('Trust the flags, not the number.'), 'corrective-antithesis'));
  assert.ok(fired(await lint('Choose clarity, not cleverness.'), 'corrective-antithesis'));
});

test('corrective-antithesis does NOT fire on plain sentential negation', async () => {
  assert.ok(!fired(await lint('I did not see the number on the screen.'), 'corrective-antithesis'));
  assert.ok(!fired(await lint('She was not at home yesterday.'), 'corrective-antithesis'));
});

test('a few structural + lexical rules still fire on their canonical tells', async () => {
  assert.ok(fired(await lint('The design is not only fast but also elegant.'), 'negative-parallelism'));
  assert.ok(fired(await lint('The city was vibrant, bustling, and diverse.'), 'rule-of-three'));
  assert.ok(fired(await lint('Moreover, the results were clear.'), 'opening-conjunction'));
});

test('score() returns a 0–100 number with a verdict', async () => {
  const { doc, lints } = await linter.lint('In today’s world, this stands as a testament to innovation.', config);
  const s = score(doc, lints);
  assert.equal(typeof s.score, 'number');
  assert.ok(s.score >= 0 && s.score <= 100);
  assert.ok(typeof s.verdict === 'string' && s.verdict.length > 0);
});
