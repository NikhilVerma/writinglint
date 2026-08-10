import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { Linter, resolveConfig, type Lint } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { ASD_STE100_ISSUE_9_COVERAGE, descriptive, procedural } from '../src/index.js';

let linter: Linter;

before(async () => {
  linter = new Linter(await loadParser());
});

async function lint(text: string, mode: 'descriptive' | 'procedural' = 'descriptive'): Promise<Lint[]> {
  const config = mode === 'procedural' ? procedural : descriptive;
  return (await linter.lint(text, resolveConfig(config))).lints;
}

const finding = (lints: Lint[], name: string): Lint | undefined =>
  lints.find((item) => item.ruleId === `technical-english/${name}`);

test('coverage accounts for every Issue 9 rule without calling review automated', () => {
  assert.equal(ASD_STE100_ISSUE_9_COVERAGE.ruleCoverage.length, 53);
  assert.equal(new Set(ASD_STE100_ISSUE_9_COVERAGE.ruleCoverage.map(({ rule }) => rule)).size, 53);
  assert.deepEqual(
    ASD_STE100_ISSUE_9_COVERAGE.ruleCoverage
      .filter(({ status }) => status === 'automated')
      .map(({ rule }) => rule),
    ASD_STE100_ISSUE_9_COVERAGE.automatedRules,
  );
});

test('rule 8.1 flags a semicolon and leaves a full stop alone', async () => {
  assert.equal(finding(await lint('Open the valve; inspect the seal.'), 'no-semicolon')?.confidence, 'high');
  assert.equal(finding(await lint('Open the valve. Inspect the seal.'), 'no-semicolon'), undefined);
});

test('rule 4.2 flags contractions without mistaking a possessive for one', async () => {
  assert.equal(finding(await lint("Don't open the panel."), 'no-contractions')?.confidence, 'high');
  assert.equal(finding(await lint("Inspect the panel's fastener."), 'no-contractions'), undefined);
});

test('procedural and descriptive modes use their respective sentence limits', async () => {
  const sentence = 'Inspect the primary hydraulic pump housing carefully before you disconnect the pressure line from the forward service manifold during scheduled maintenance.';
  assert.ok(finding(await lint(sentence, 'procedural'), 'sentence-length'));
  assert.equal(finding(await lint(sentence, 'descriptive'), 'sentence-length'), undefined);
});

test('rule 6.6 flags only descriptive paragraphs with more than six sentences', async () => {
  const paragraph = 'One. Two. Three. Four. Five. Six. Seven.';
  assert.ok(finding(await lint(paragraph), 'paragraph-length'));
  assert.equal(finding(await lint(paragraph, 'procedural'), 'paragraph-length'), undefined);
});

test('rule 3.6 flags passive voice and leaves a direct instruction alone', async () => {
  assert.ok(finding(await lint('The valve is opened by the technician.', 'procedural'), 'passive-voice'));
  assert.equal(finding(await lint('Open the valve.', 'procedural'), 'passive-voice'), undefined);
});
