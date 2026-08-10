import { Linter, resolveConfig } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import {
  ISSUE_9_RULE_IDS,
  parseAsdSte100Issue9StandardData,
  withAsdSte100StandardData,
  descriptive,
  procedural,
  type AsdSte100Issue9StandardData,
} from '../src/index.js';

interface ConformanceCase {
  id: string;
  text: string;
  mode: 'descriptive' | 'procedural';
  ruleId: string;
  expectedFinding: boolean;
  standardData?: AsdSte100Issue9StandardData;
}

function scaleOption(): number {
  const index = process.argv.indexOf('--scale');
  if (index === -1) return 25;
  const value = Number(process.argv[index + 1]);
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000) {
    throw new Error('--scale must be an integer from 1 through 1000.');
  }
  return value;
}

function standardData(): AsdSte100Issue9StandardData {
  const entry = (headword: string, approved: boolean, partOfSpeech: string, index: number) => ({
    headword,
    approved,
    partOfSpeech,
    formsText: null,
    source: { ref: `#/synthetic/${index}`, page: 149 + (index % 275) },
  });
  const entries = [
    entry('INSTALL', true, 'verb', 0),
    entry('TEST', true, 'noun', 1),
    ...Array.from({ length: 873 }, (_, index) => entry(`APPROVED${index}`, true, 'noun', index + 2)),
    entry('utilize', false, 'verb', 875),
    ...Array.from({ length: 1314 }, (_, index) => entry(`unapproved${index}`, false, 'noun', index + 876)),
  ];
  return parseAsdSte100Issue9StandardData({
    schemaVersion: 1,
    parserVersion: 'conformance-matrix',
    source: { filename: 'synthetic.pdf', pages: 434, doclingJsonSha256: 'c'.repeat(64) },
    writingRules: {
      sections: Array.from({ length: 9 }, (_, index) => ({ number: index + 1 })),
      rules: ISSUE_9_RULE_IDS.map((id) => ({ id })),
    },
    dictionary: {
      stats: { tables: 275, entries: 2190, approvedEntries: 875 },
      entries,
    },
  });
}

function words(count: number, offset: number): string {
  const vocabulary = ['valve', 'panel', 'filter', 'cable', 'switch', 'housing', 'connector'];
  return `${Array.from({ length: count }, (_, index) => vocabulary[(index + offset) % vocabulary.length]).join(' ')}.`;
}

function cases(scale: number, data: AsdSte100Issue9StandardData): ConformanceCase[] {
  const rows: ConformanceCase[] = [];
  const contractions = ["don't", 'isn’t', "we're", "they've", "you'll", "I'd", "can't", "let's"];
  const possessives = ["panel's fastener", "technicians' tools", "unit's label"];
  const devices = ['valve', 'panel', 'filter', 'pump', 'cable', 'switch', 'connector'];
  for (let iteration = 0; iteration < scale; iteration += 1) {
    for (const [index, punctuation] of [';', '.', ',', ':'].entries()) {
      rows.push({
        id: `semicolon-${iteration}-${index}`,
        text: `Inspect the ${devices[iteration % devices.length]}${punctuation} record result ${iteration}.`,
        mode: 'procedural',
        ruleId: 'technical-english/no-semicolon',
        expectedFinding: punctuation === ';',
      });
    }
    for (const [index, contraction] of contractions.entries()) {
      rows.push({
        id: `contraction-${iteration}-${index}`,
        text: `${contraction} open panel ${iteration}.`,
        mode: 'procedural',
        ruleId: 'technical-english/no-contractions',
        expectedFinding: true,
      });
    }
    rows.push({
      id: `noun-contraction-${iteration}`,
      text: `The technician's finished the inspection at station ${iteration}.`,
      mode: 'descriptive',
      ruleId: 'technical-english/no-contractions',
      expectedFinding: true,
    });
    for (const [index, possessive] of possessives.entries()) {
      rows.push({
        id: `possessive-${iteration}-${index}`,
        text: `Inspect the ${possessive} near station ${iteration}.`,
        mode: 'procedural',
        ruleId: 'technical-english/no-contractions',
        expectedFinding: false,
      });
    }
    for (const mode of ['procedural', 'descriptive'] as const) {
      const limit = mode === 'procedural' ? 20 : 25;
      for (const delta of [-1, 0, 1]) {
        rows.push({
          id: `length-${mode}-${iteration}-${delta}`,
          text: words(limit + delta, iteration),
          mode,
          ruleId: 'technical-english/sentence-length',
          expectedFinding: delta === 1,
        });
      }
    }
    for (const sentenceCount of [5, 6, 7]) {
      rows.push({
        id: `paragraph-${iteration}-${sentenceCount}`,
        text: Array.from({ length: sentenceCount }, (_, index) => `Unit ${iteration}-${index} operates.`).join(' '),
        mode: 'descriptive',
        ruleId: 'technical-english/paragraph-length',
        expectedFinding: sentenceCount === 7,
      });
    }
    rows.push(
      {
        id: `passive-${iteration}`,
        text: `The ${devices[iteration % devices.length]} was removed by the technician.`,
        mode: 'procedural',
        ruleId: 'technical-english/passive-voice',
        expectedFinding: true,
      },
      {
        id: `active-${iteration}`,
        text: `The technician removed the ${devices[iteration % devices.length]}.`,
        mode: 'procedural',
        ruleId: 'technical-english/passive-voice',
        expectedFinding: false,
      },
      {
        id: `predicate-adjective-${iteration}`,
        text: `The ${devices[iteration % devices.length]} is open.`,
        mode: 'procedural',
        ruleId: 'technical-english/passive-voice',
        expectedFinding: false,
      },
      {
        id: `dictionary-unapproved-${iteration}`,
        text: `Utilize the tool at station ${iteration}.`,
        mode: 'procedural',
        ruleId: 'technical-english/dictionary-word-approval',
        expectedFinding: true,
        standardData: data,
      },
      {
        id: `dictionary-approved-${iteration}`,
        text: `Install the tool at station ${iteration}.`,
        mode: 'procedural',
        ruleId: 'technical-english/dictionary-word-approval',
        expectedFinding: false,
        standardData: data,
      },
      {
        id: `dictionary-part-${iteration}`,
        text: `Test the unit at station ${iteration}.`,
        mode: 'procedural',
        ruleId: 'technical-english/dictionary-part-of-speech',
        expectedFinding: true,
        standardData: data,
      },
    );
  }
  return rows;
}

const scale = scaleOption();
const data = standardData();
const matrix = cases(scale, data);
const linter = new Linter(await loadParser());
const mismatches: Array<{ id: string; expected: boolean; actual: boolean }> = [];
const totals = new Map<string, { passed: number; total: number }>();

for (const row of matrix) {
  const config = row.standardData
    ? withAsdSte100StandardData(row.mode, row.standardData)
    : row.mode === 'procedural' ? procedural : descriptive;
  const { lints } = await linter.lint(row.text, resolveConfig(config));
  const actual = lints.some(({ ruleId }) => ruleId === row.ruleId);
  const result = totals.get(row.ruleId) ?? { passed: 0, total: 0 };
  result.total += 1;
  if (actual === row.expectedFinding) result.passed += 1;
  else mismatches.push({ id: row.id, expected: row.expectedFinding, actual });
  totals.set(row.ruleId, result);
}

console.log(`Conformance matrix: ${matrix.length - mismatches.length}/${matrix.length} checks matched across ${totals.size} detectors.`);
for (const [ruleId, result] of [...totals].sort(([left], [right]) => left.localeCompare(right))) {
  console.log(`  ${ruleId}: ${result.passed}/${result.total}`);
}
for (const mismatch of mismatches.slice(0, 20)) {
  console.log(`  mismatch ${mismatch.id}: expected=${mismatch.expected} actual=${mismatch.actual}`);
}
if (mismatches.length > 20) console.log(`  ${mismatches.length - 20} more mismatches omitted.`);
if (mismatches.length) process.exitCode = 1;
