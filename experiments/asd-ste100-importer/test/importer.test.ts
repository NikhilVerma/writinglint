import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderedNodes } from '../src/docling.js';
import { parseHeadwordField, repairIssue9DictionaryCell } from '../src/dictionary.js';
import { parseSteDocument } from '../src/parser.js';
import { normalizeDictionaryTable, normalizeExtractedText } from '../src/tables.js';
import { syntheticDoclingDocument } from './fixture.js';

test('reference resolver preserves nested group order', () => {
  const nodes = orderedNodes(syntheticDoclingDocument());
  assert.equal(nodes[0]!.kind, 'text');
  assert.equal(nodes[0]!.ref, '#/texts/0');
  assert.equal(nodes[1]!.kind, 'table');
  assert.equal(nodes[1]!.ref, '#/tables/0');
  assert.equal(nodes[2]!.ref, '#/texts/1');
});

test('rule handler prefers section headers and recovers a misclassified rule title', () => {
  const result = parseSteDocument(syntheticDoclingDocument(), { validateIssue9: false });
  assert.deepEqual(result.writingRules.rules.map(({ id }) => id), ['1.1', '2.1', '2.2']);
  assert.equal(result.writingRules.rules[0]!.source.ref, '#/texts/4');
  assert.equal(result.writingRules.rules[2]!.source.ref, '#/texts/9');
  assert.equal(result.writingRules.rules[2]!.blocks[0]!.kind, 'paragraph');
});

test('front-matter handler parses the subject-to-rule index separately', () => {
  const result = parseSteDocument(syntheticDoclingDocument(), { validateIssue9: false });
  assert.deepEqual(result.frontMatter.subjectIndex, [{
    subject: 'Approved words',
    references: '1.1',
    source: { ref: '#/tables/0', page: 1, bbox: null },
  }]);
});

test('dictionary handler groups continuation rows under their entry', () => {
  const result = parseSteDocument(syntheticDoclingDocument(), { validateIssue9: false });
  assert.equal(result.dictionary.stats.tables, 2);
  assert.equal(result.dictionary.stats.entries, 3);
  assert.equal(result.dictionary.stats.approvedEntries, 1);
  assert.equal(result.dictionary.stats.nonApprovedEntries, 2);
  const wrap = result.dictionary.entries.find(({ headword }) => headword === 'wrap')!;
  assert.equal(wrap.rows.length, 2);
  assert.equal(wrap.rows[1]!.cells.approvedMeaningOrAlternatives.text, 'WIND (v)');
  assert.equal(wrap.rows[1]!.cells.steExample.text, 'WIND THREE-PHASE TAPE.');
});

test('table handler maps a five-column callout grid to four semantic columns', () => {
  const document = syntheticDoclingDocument();
  const table = orderedNodes(document).find((node) => node.ref === '#/tables/2');
  assert.ok(table?.kind === 'table');
  const issues: never[] = [];
  const normalized = normalizeDictionaryTable(table, issues)!;
  assert.equal(normalized.physicalColumns, 5);
  assert.equal(normalized.rows[0]!.cells.word.text, 'whose (pron)');
  assert.equal(normalized.rows[0]!.cells.approvedMeaningOrAlternatives.text, 'Use a different construction.');
  assert.equal(normalized.rows[0]!.cells.steExample.text, 'USE TWO SENTENCES.');
});

test('normalization records line-wrap hyphens and private-use degree symbols', () => {
  const normalized = normalizeExtractedText('SUPPLY THREE- PHASE AIR AT 24 \uF0B0 C.');
  assert.equal(normalized.text, 'SUPPLY THREE-PHASE AIR AT 24 ° C.');
  assert.deepEqual(normalized.normalizations.map(({ kind }) => kind), [
    'private-use-symbol',
    'line-wrap-hyphen',
  ]);
});

test('dictionary repair fixes verified layout splits without changing real prefixes', () => {
  const repaired = repairIssue9DictionaryCell({
    rawText: 'COUNTERCLOCK- WISE (adv): OPER A TION; re- (prefix)',
    text: 'COUNTERCLOCK-WISE (adv): OPER A TION; re- (prefix)',
    normalizations: [],
    sourceCells: [],
  });
  assert.equal(repaired.text, 'COUNTERCLOCKWISE (adv): OPERATION; re- (prefix)');
  assert.deepEqual(repaired.normalizations.map(({ kind }) => kind), [
    'source-layout-repair',
    'source-layout-repair',
  ]);
});

test('headword parser separates lexical text, part of speech, forms, and approval', () => {
  assert.deepEqual(parseHeadwordField('WRITE (v), WRITES, WROTE, WRITTEN'), {
    headword: 'WRITE',
    partOfSpeech: 'verb',
    formsText: 'WRITES, WROTE, WRITTEN',
    approved: true,
  });
  assert.deepEqual(parseHeadwordField('case (in case of) (conj)'), {
    headword: 'case (in case of)',
    partOfSpeech: 'conjunction',
    formsText: null,
    approved: false,
  });
  assert.deepEqual(parseHeadwordField('re- (prefix)'), {
    headword: 're-',
    partOfSpeech: 'prefix',
    formsText: null,
    approved: false,
  });
});
