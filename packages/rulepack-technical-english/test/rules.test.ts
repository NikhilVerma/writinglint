import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import {
  InMemoryTerminologyProvider,
  Linter,
  defineConfig,
  resolveConfig,
  type ActiveSeverity,
  type Lint,
} from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import {
  ASD_STE100_ISSUE_9_COVERAGE,
  ISSUE_9_RULE_IDS,
  assessAsdSte100Issue9,
  descriptive,
  parseAsdSte100Issue9StandardData,
  procedural,
  technicalEnglish,
  withAsdSte100StandardData,
} from '../src/index.js';

let linter: Linter;

before(async () => {
  linter = new Linter(await loadParser());
});

async function lint(text: string, mode: 'descriptive' | 'procedural' = 'descriptive'): Promise<Lint[]> {
  const config = mode === 'procedural' ? procedural : descriptive;
  return (await linter.lint(text, resolveConfig(config))).lints;
}

const findings = (lints: Lint[], name: string): Lint[] =>
  lints.filter((item) => item.ruleId === `technical-english/${name}`);

const finding = (lints: Lint[], name: string): Lint | undefined => findings(lints, name)[0];

const words = (count: number): string => `${Array.from({ length: count }, () => 'valve').join(' ')}.`;

const assessmentLint = (ruleId: string, severity: ActiveSeverity): Lint => ({
  ruleId,
  category: 'test',
  severity,
  confidence: 'high',
  start: 0,
  end: 4,
  text: 'test',
  message: 'Test finding.',
});

const syntheticDictionaryEntries = [
  {
    headword: 'INSTALL', approved: true, partOfSpeech: 'verb', formsText: 'INSTALLS, INSTALLED, INSTALLED',
    source: { ref: '#/tables/approved-install', page: 1 },
  },
  {
    headword: 'TEST', approved: true, partOfSpeech: 'noun', formsText: null,
    source: { ref: '#/tables/approved-test', page: 1 },
  },
  ...Array.from({ length: 873 }, (_, index) => ({
    headword: `APPROVED${index}`, approved: true, partOfSpeech: 'noun', formsText: null,
    source: { ref: `#/tables/approved-${index}`, page: 2 + (index % 100) },
  })),
  {
    headword: 'utilize', approved: false, partOfSpeech: 'verb', formsText: null,
    source: { ref: '#/tables/unapproved-utilize', page: 200 },
  },
  ...Array.from({ length: 1314 }, (_, index) => ({
    headword: `unapproved${index}`, approved: false, partOfSpeech: 'noun', formsText: null,
    source: { ref: `#/tables/unapproved-${index}`, page: 201 + (index % 200) },
  })),
];

const syntheticParsedStandard = {
  schemaVersion: 1,
  parserVersion: 'test-parser',
  source: {
    filename: 'locally-supplied.pdf',
    pages: 434,
    doclingJsonSha256: 'a'.repeat(64),
  },
  writingRules: {
    sections: Array.from({ length: 9 }, (_, index) => ({ number: index + 1 })),
    rules: ISSUE_9_RULE_IDS.map((id) => ({ id })),
  },
  dictionary: {
    stats: { tables: 275, entries: 2190, approvedEntries: 875 },
    entries: syntheticDictionaryEntries,
  },
};

const syntheticStandardData = parseAsdSte100Issue9StandardData(syntheticParsedStandard);

test('coverage enumerates all 53 Issue 9 references exactly once', () => {
  const coverage = ASD_STE100_ISSUE_9_COVERAGE.ruleCoverage;
  assert.equal(coverage.length, 53);
  assert.equal(new Set(coverage.map(({ rule }) => rule)).size, 53);
  assert.equal(coverage[0]?.rule, '1.1');
  assert.equal(coverage.at(-1)?.rule, '9.4');
  assert.equal(coverage.filter(({ status }) => status === 'automated').length, 6);
  assert.equal(coverage.filter(({ status }) => status === 'assisted').length, 2);
  assert.equal(coverage.filter(({ status }) => status === 'review-required').length, 45);
  assert.deepEqual(
    coverage.filter(({ status }) => status === 'automated').map(({ rule }) => rule),
    ASD_STE100_ISSUE_9_COVERAGE.automatedRules,
  );
});

test('coverage connects every automated or data-assisted reference to a real detector in both directions', () => {
  const checked = ASD_STE100_ISSUE_9_COVERAGE.ruleCoverage
    .filter(({ status }) => status === 'automated' || status === 'assisted');
  const documentedDetectors = new Set(checked.flatMap(({ detectors }) => detectors));
  const implementedDetectors = new Set(Object.keys(technicalEnglish.rules).map((name) => `technical-english/${name}`));
  assert.deepEqual(documentedDetectors, implementedDetectors);
  assert.ok(checked.every(({ detectors }) => detectors.length > 0));
  assert.ok(ASD_STE100_ISSUE_9_COVERAGE.ruleCoverage
    .filter(({ status }) => status === 'review-required')
    .every(({ detectors }) => detectors.length === 0));
});

test('standard-data loader validates parser output and keeps source provenance', () => {
  assert.equal(syntheticStandardData.rules.length, 53);
  assert.equal(syntheticStandardData.terminology.entries.length, 2190);
  assert.equal(syntheticStandardData.terminology.approvedEntries, 875);
  assert.equal(syntheticStandardData.terminology.entries[0]?.source.ref, '#/tables/approved-install');
  assert.throws(
    () => parseAsdSte100Issue9StandardData({ ...syntheticParsedStandard, writingRules: { sections: [], rules: [] } }),
    /53 Issue 9 references/,
  );
  assert.throws(
    () => parseAsdSte100Issue9StandardData({
      ...syntheticParsedStandard,
      issues: [{ severity: 'error', code: 'bad-table' }],
    }),
    /parser reported 1 error/,
  );
});

test('user-supplied standard data enables deterministic dictionary checks', async () => {
  const config = withAsdSte100StandardData('procedural', syntheticStandardData);
  const rejected = await linter.lint('Utilize the tool.', resolveConfig(config));
  assert.equal(finding(rejected.lints, 'dictionary-word-approval')?.text, 'Utilize');
  assert.equal(finding(rejected.lints, 'dictionary-word-approval')?.severity, 'error');

  const approvedForm = await linter.lint('Install the tool.', resolveConfig(config));
  assert.equal(finding(approvedForm.lints, 'dictionary-word-approval'), undefined);

  const wrongPart = await linter.lint('Test the unit.', resolveConfig(config));
  assert.equal(finding(wrongPart.lints, 'dictionary-part-of-speech')?.text, 'Test');
  assert.equal(finding(wrongPart.lints, 'dictionary-part-of-speech')?.severity, 'warn');
});

test('assessment records whether local standard data actually ran', () => {
  const baseline = assessAsdSte100Issue9([]);
  assert.equal(baseline.standardData.loaded, false);
  assert.equal(baseline.executedRules.length, 6);
  const enriched = assessAsdSte100Issue9([], { standardData: syntheticStandardData });
  assert.equal(enriched.standardData.loaded, true);
  assert.equal(enriched.standardData.fingerprint, `sha256:${'a'.repeat(64)}`);
  assert.deepEqual(enriched.executedRules.slice(-2), ['1.1', '1.2']);
});

test('assessment reserves a clean automated run for human review', () => {
  const assessment = assessAsdSte100Issue9([]);
  assert.equal(assessment.status, 'review-required');
  assert.equal(assessment.automatedRuleFindings, 0);
  assert.equal(assessment.automatedRules.length, 6);
  assert.ok(assessment.reviewRequired.length > 0);
});

test('assessment treats warning-only technical findings as review-required', () => {
  const assessment = assessAsdSte100Issue9([
    assessmentLint('technical-english/passive-voice', 'warn'),
    assessmentLint('technical-english/sentence-length', 'warn'),
  ]);
  assert.equal(assessment.status, 'review-required');
  assert.equal(assessment.automatedRuleFindings, 2);
});

test('assessment establishes nonconformance from an error and ignores other rulepacks', () => {
  const assessment = assessAsdSte100Issue9([
    assessmentLint('ai-style/ai-vocabulary', 'error'),
    assessmentLint('technical-english/no-semicolon', 'error'),
  ]);
  assert.equal(assessment.status, 'nonconformant');
  assert.equal(assessment.automatedRuleFindings, 1);
});

test('rule 8.1 reports every semicolon with exact source spans', async () => {
  const text = 'Open the valve; inspect the seal; record the result.';
  const matches = findings(await lint(text), 'no-semicolon');
  assert.deepEqual(matches.map(({ start, end, text }) => ({ start, end, text })), [
    { start: 14, end: 15, text: ';' },
    { start: 32, end: 33, text: ';' },
  ]);
  assert.ok(matches.every(({ confidence, severity }) => confidence === 'high' && severity === 'error'));
});

test('rule 8.1 leaves other sentence punctuation alone', async () => {
  assert.equal(finding(await lint('Open the valve. Inspect the seal, then record the result: pass.'), 'no-semicolon'), undefined);
});

test('rule 4.2 recognizes ASCII, curly, uppercase, and pronoun contractions', async () => {
  for (const contraction of ["Don't", 'isn’t', "WE'RE", 'it’s', "let's"]) {
    const match = finding(await lint(`${contraction} permitted.`), 'no-contractions');
    assert.equal(match?.text, contraction);
    assert.equal(match?.confidence, 'high');
  }
});

test('rule 4.2 distinguishes a noun-subject contraction from a possessive', async () => {
  assert.equal(
    finding(await lint("The technician's finished the inspection."), 'no-contractions')?.text,
    "technician's",
  );
  assert.equal(
    finding(await lint("Inspect the technician's finished inspection."), 'no-contractions'),
    undefined,
  );
});

test('rule 4.2 does not mistake possessives or standalone apostrophes for contractions', async () => {
  for (const text of ["Inspect the panel's fastener.", "Use the technicians' tools.", "The 'OPEN' label is green."]) {
    assert.equal(finding(await lint(text), 'no-contractions'), undefined);
  }
});

test('rule 5.1 permits 20 procedural words and reports 21', async () => {
  assert.equal(finding(await lint(words(20), 'procedural'), 'sentence-length'), undefined);
  assert.match(finding(await lint(words(21), 'procedural'), 'sentence-length')?.message ?? '', /21 parsed words.*20/);
});

test('rule 6.3 permits 25 descriptive words and reports 26', async () => {
  assert.equal(finding(await lint(words(25), 'descriptive'), 'sentence-length'), undefined);
  assert.match(finding(await lint(words(26), 'descriptive'), 'sentence-length')?.message ?? '', /26 parsed words.*25/);
});

test('sentence counting can group caller annotations into one inspectable unit', async () => {
  const text = words(21);
  const first = text.indexOf('valve');
  const secondEnd = text.indexOf('valve', first + 1) + 'valve'.length;
  const report = await linter.lint(text, resolveConfig(procedural), {
    annotations: [{ kind: 'technical-name', start: first, end: secondEnd, provider: 'project-glossary' }],
  });
  const configured = defineConfig({
    extends: [procedural],
    rules: {
      'technical-english/sentence-length': ['warn', {
        mode: 'procedural',
        countPolicy: { id: 'test/group-technical-name', groupAnnotationKinds: ['technical-name'] },
      }],
    },
  });
  const grouped = await linter.lint(text, resolveConfig(configured), {
    annotations: report.doc.annotations,
  });
  assert.equal(finding(grouped.lints, 'sentence-length'), undefined);
});

test('region modes override a document-wide technical mode', async () => {
  const text = words(21);
  const result = await linter.lint(text, resolveConfig(descriptive), {
    regions: [{ id: 'step', role: 'step', mode: 'procedural', start: 0, end: text.length }],
  });
  const match = finding(result.lints, 'sentence-length');
  assert.match(match?.message ?? '', /21 parsed words.*20/);
  assert.equal(match?.evidence?.[0]?.data?.mode, 'procedural');
});

test('rule 6.6 permits six descriptive sentences and reports seven', async () => {
  assert.equal(finding(await lint('One. Two. Three. Four. Five. Six.', 'descriptive'), 'paragraph-length'), undefined);
  assert.match(
    finding(await lint('One. Two. Three. Four. Five. Six. Seven.', 'descriptive'), 'paragraph-length')?.message ?? '',
    /seven|7/i,
  );
});

test('rule 6.6 counts paragraphs separately and stays off in procedural mode', async () => {
  const split = 'One. Two. Three. Four.\n\nFive. Six. Seven. Eight.';
  assert.equal(finding(await lint(split, 'descriptive'), 'paragraph-length'), undefined);
  assert.equal(finding(await lint('One. Two. Three. Four. Five. Six. Seven.', 'procedural'), 'paragraph-length'), undefined);
});

test('a procedural region suppresses the descriptive paragraph limit in a mixed document', async () => {
  const text = 'One. Two. Three. Four. Five. Six. Seven.';
  const result = await linter.lint(text, resolveConfig(descriptive), {
    regions: [{ id: 'procedure', role: 'procedure', mode: 'procedural', start: 0, end: text.length }],
  });
  assert.equal(finding(result.lints, 'paragraph-length'), undefined);
});

test('rule 3.6 reports passive voice with and without a named actor', async () => {
  assert.ok(finding(await lint('The valve is opened by the technician.', 'procedural'), 'passive-voice'));
  assert.ok(finding(await lint('The valve was opened.', 'procedural'), 'passive-voice'));
});

test('rule 3.6 leaves direct instructions and predicate adjectives alone', async () => {
  assert.equal(finding(await lint('Open the valve.', 'procedural'), 'passive-voice'), undefined);
  assert.equal(finding(await lint('The valve is open.', 'procedural'), 'passive-voice'), undefined);
});

test('rule 3.6 explains the limited descriptive exception without suppressing the signal', async () => {
  const match = finding(await lint('The valve was opened.', 'descriptive'), 'passive-voice');
  assert.equal(match?.severity, 'warn');
  assert.match(match?.message ?? '', /unless the actor is unknown or unimportant/);
});

test('dictionary rules can consume a generic terminology service without ASD-shaped options', async () => {
  const provider = new InMemoryTerminologyProvider({
    id: 'house-style', layer: 'organization', languages: ['en'],
  }, [{
    id: 'avoid-utilize', term: 'utilize', status: 'unapproved', language: 'en',
    provenance: { source: 'house style', version: '1' },
  }]);
  const config = defineConfig({
    plugins: { 'technical-english': technicalEnglish },
    rules: { 'technical-english/dictionary-word-approval': 'error' },
  });
  const result = await linter.lint('Utilize the tool.', resolveConfig(config), {
    language: 'en', services: { terminology: provider },
  });
  const match = finding(result.lints, 'dictionary-word-approval');
  assert.equal(match?.text, 'Utilize');
  assert.equal(match?.evidence?.[0]?.data?.provider, 'house-style');
});
