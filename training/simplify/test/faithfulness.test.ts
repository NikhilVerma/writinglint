import assert from 'node:assert/strict';
import test from 'node:test';

import { echoRate, extractAnchors, faithfulness } from '../src/lib/faithfulness.ts';

// Fixtures are excerpts of a real pull-request description and of the real
// Qwen3-4B output that prompted this check, not text written for the test.
const SOURCE = [
  'API offline **4146 pass / 0 fail**; L2 **225/225** (two specs, `--repeat-each=15`);',
  'schema 1488, sfm 532, repository-service 386.',
  'Mutation-verified: 6 fixes, each mutation made the intended test fail.',
  'The branch adds **zero** lint-baseline entries.',
  'See `verify-verbatim-anchors.ts` for the `doc_versions.git_commit_sha` case.',
].join('\n');

test('extractAnchors picks up code spans, identifiers and numbers', () => {
  const anchors = extractAnchors(SOURCE);
  assert.ok(anchors.symbols.has('verify-verbatim-anchors.ts'));
  assert.ok(anchors.symbols.has('doc_versions.git_commit_sha'));
  assert.ok(anchors.symbols.has('--repeat-each=15'));
  assert.ok(anchors.numbers.has('n:4146'));
  assert.ok(anchors.numbers.has('n:532'));
});

test('a verbatim copy keeps every anchor and echoes almost everything', () => {
  const result = faithfulness(SOURCE, SOURCE);
  assert.equal(result.keptRate, 1);
  assert.equal(result.inventedCount, 0);
  assert.equal(echoRate(SOURCE, SOURCE), 1);
});

test('a faithful rewrite keeps its anchors while echoing far less', () => {
  const rewrite = [
    'The offline API suite records 4146 pass and 0 fail. L2 records 225/225',
    'across two specs run with `--repeat-each=15`.',
    'Schema records 1488, sfm 532, and repository-service 386.',
    'Six fixes are mutation-verified. Every mutation failed the test it targeted.',
    'The branch adds zero lint-baseline entries.',
    'The `doc_versions.git_commit_sha` case lives in `verify-verbatim-anchors.ts`.',
  ].join('\n');
  const result = faithfulness(SOURCE, rewrite);
  assert.equal(result.droppedCount, 0, `dropped: ${result.droppedSample.join(', ')}`);
  assert.equal(result.inventedCount, 0, `invented: ${result.inventedSample.join(', ')}`);
  assert.ok(echoRate(SOURCE, rewrite) < 0.5);
});

test('spelling a small number out does not count as a dropped anchor', () => {
  const result = faithfulness('Mutation-verified: 6 fixes.', 'Six fixes are mutation-verified.');
  assert.equal(result.droppedCount, 0);
  assert.equal(result.inventedCount, 0);
});

test('the confabulation this check exists to catch is flagged', () => {
  // What Qwen3-4B produced at temperature 1.2: it read "API offline 4146 pass"
  // as a status report and dropped every count that followed.
  const invented = [
    'The API is offline at this time. 4146 pass/0 fail.',
    'It passes 7 lint gates with 100% success.',
    "The branch doesn't have 0 entries in the lint baseline.",
  ].join('\n');
  const result = faithfulness(SOURCE, invented);
  assert.ok(result.keptRate < 0.6, `keptRate was ${result.keptRate}`);
  assert.ok(result.inventedCount > 0, 'expected invented anchors');
  assert.ok(result.droppedSample.includes('verify-verbatim-anchors.ts'));
});

test('echoRate ignores casing and punctuation', () => {
  assert.equal(echoRate('The quick brown fox jumps', 'the QUICK, brown fox jumps!'), 1);
  assert.equal(echoRate('The quick brown fox jumps', 'A slow grey badger sleeps here'), 0);
});

test('a percent sign or a trailing zero is not a different number', () => {
  const source = 'Coverage sits at 95% and the ratio is 1.0 across 12 lanes.';
  const rewrite = 'Coverage sits at 95 percent. The ratio is 1 across twelve lanes.';
  const result = faithfulness(source, rewrite);
  assert.equal(result.keptRate, 1);
  assert.equal(result.inventedCount, 0);
});

test('a genuinely different number still counts as dropped', () => {
  const source = 'Coverage sits at 95% across 12 lanes.';
  const rewrite = 'Coverage sits at 59 percent across 21 lanes.';
  const result = faithfulness(source, rewrite);
  assert.ok(result.keptRate < 0.5, `expected most anchors dropped, got ${result.keptRate}`);
  assert.ok(result.inventedCount >= 2, `expected invented numbers, got ${result.inventedCount}`);
});
