import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { Linter, resolveConfig, type Lint } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { readerFirst, recommended, strict } from '../src/index.js';

let linter: Linter;

before(async () => {
  linter = new Linter(await loadParser());
});

async function lint(text: string, includeInfo = false): Promise<Lint[]> {
  return (await linter.lint(text, resolveConfig(includeInfo ? strict : recommended))).lints;
}

const finding = (lints: Lint[], name: string): Lint | undefined =>
  lints.find((item) => item.ruleId === `reader-first/${name}`);

test('the pack exposes each implemented detector through every preset', () => {
  assert.deepEqual(Object.keys(readerFirst.rules).sort(), [
    'noun-pile',
    'paragraph-load',
    'sentence-load',
    'unexplained-initialism',
  ]);
  assert.deepEqual(Object.keys(readerFirst.configs ?? {}).sort(), ['ci', 'recommended', 'strict']);
});

test('sentence-load reports a long sentence with clauses and internal labels', async () => {
  const text = 'The scopePlanner reads `frameworkCriterionId`, and if the legacy root has no matching identifier, it normalizes the criterion name, compares every candidate, keeps the most recent result, and then returns the fallback tree so the next workflow can continue without losing prior context.';
  const match = finding(await lint(text), 'sentence-load');
  assert.ok(match);
  assert.match(match.message, /words.*clause breaks.*technical labels/);
  assert.deepEqual({ start: match.start, end: match.end }, { start: 0, end: text.length });
});

test('sentence-load leaves a plain long sentence alone when its structure remains easy to follow', async () => {
  const text = 'The technician opened the cabinet and checked every cable in the upper tray before recording the serial numbers in the maintenance log for the team that would return during the next shift.';
  assert.equal(finding(await lint(text), 'sentence-load'), undefined);
});

test('sentence-load reports a very long sentence even without code identifiers', async () => {
  const text = `${Array.from({ length: 46 }, (_, index) => `word${index}`).join(' ')}.`;
  assert.ok(finding(await lint(text), 'sentence-load'));
});

test('paragraph-load reports only a large prose block', async () => {
  const sentence = 'The operator checks the record and writes the result before the next inspection begins.';
  const loaded = Array.from({ length: 10 }, () => sentence).join(' ');
  assert.ok(finding(await lint(loaded), 'paragraph-load'));
  assert.equal(finding(await lint(`${sentence} ${sentence} ${sentence}`), 'paragraph-load'), undefined);
});

test('unexplained-initialism reports a repeated unexplained term at its first use', async () => {
  const text = 'The MCP starts the local service. The MCP then reads the project configuration.';
  const match = finding(await lint(text), 'unexplained-initialism');
  assert.equal(match?.text, 'MCP');
  assert.deepEqual({ start: match?.start, end: match?.end }, { start: 4, end: 7 });
});

test('unexplained-initialism accepts an introduced term and common web vocabulary', async () => {
  const text = 'The Model Context Protocol (MCP) starts the service. The MCP reads a JSON file from the API.';
  assert.equal(finding(await lint(text), 'unexplained-initialism'), undefined);
});

test('noun-pile reports a parsed common-noun stack but leaves ordinary pairs alone', async () => {
  const loaded = await lint('The team changed the customer onboarding flow migration project timeline yesterday.');
  assert.ok(finding(loaded, 'noun-pile'));
  assert.equal(finding(await lint('The team changed the migration timeline yesterday.'), 'noun-pile'), undefined);
});

test('strict includes low-confidence load reviews while recommended keeps warnings', async () => {
  const text = 'The `scopePlanner` compares records, and if one record is old, it normalizes names, and when another record is missing, it applies the fallback, which keeps the process moving for every application in the system today.';
  assert.equal(finding(await lint(text), 'sentence-load'), undefined);
  assert.equal(finding(await lint(text, true), 'sentence-load')?.severity, 'info');
});
