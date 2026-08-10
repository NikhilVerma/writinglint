import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Linter, resolveConfig } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { descriptive, procedural } from '../src/index.js';
import {
  assignSplits,
  loadCandidates,
  selectEvaluableCandidates,
  type EvaluationSplit,
  type ExpectedFinding,
} from './dataset.js';

const EXPOSURE_LOG_PATH = fileURLToPath(new URL('./exposure-log.jsonl', import.meta.url));
const VALID_SPLITS: EvaluationSplit[] = ['development', 'evaluation', 'reserved-public', 'final-holdout'];

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const requestedSplit = option('--split') ?? 'development';
if (!VALID_SPLITS.includes(requestedSplit as EvaluationSplit)) {
  throw new Error(`--split must be one of: ${VALID_SPLITS.join(', ')}.`);
}
const split = requestedSplit as EvaluationSplit;
const seed = option('--seed') ?? 'ste-eval-v1';
const allowUnreviewed = process.argv.includes('--allow-unreviewed-candidates');
const externalFinalPath = option('--external-final');

if (split === 'final-holdout' && (!externalFinalPath || !process.argv.includes('--open-final'))) {
  throw new Error('A final holdout requires --external-final <private-jsonl> and --open-final. Read eval/README.md first.');
}

const sourceCandidates = split === 'final-holdout' ? loadCandidates(externalFinalPath) : loadCandidates();
if (split === 'final-holdout' && sourceCandidates.some(({ evaluation }) => evaluation.pool !== 'external-final')) {
  throw new Error('Every row in --external-final must use evaluation.pool "external-final".');
}
const assigned = assignSplits(sourceCandidates, seed).filter((candidate) => candidate.split === split);
const selected = selectEvaluableCandidates(assigned, allowUnreviewed, split);

if (split !== 'development') {
  const actor = option('--actor');
  const purpose = option('--purpose');
  if (!actor || !purpose) {
    throw new Error('Evaluation and final-holdout runs require --actor and --purpose so exposure can be recorded.');
  }
  appendFileSync(EXPOSURE_LOG_PATH, `${JSON.stringify({
    schemaVersion: 1,
    event: 'evaluated',
    datasetVersion: 'ste-candidates-v1',
    at: new Date().toISOString(),
    actor,
    split,
    seed,
    purpose,
    influencedDetectorDecisions: null,
    notes: 'Set influencedDetectorDecisions after deciding whether this result changes a detector.',
  })}\n`);
}

if (!selected.length) {
  console.log(`No human-approved candidates are available in ${split}.`);
  console.log('Use --allow-unreviewed-candidates only for provisional detector diagnostics.');
  process.exit(0);
}

function findingsMatch(
  actual: { ruleId: string; text: string; start: number; end: number }[],
  expected: ExpectedFinding[],
): boolean {
  const expectedRows = expected.flatMap((finding) => finding.matches.map((match) => ({
    ruleId: finding.ruleId,
    ...match,
  })))
    .sort((left, right) => left.start - right.start || left.end - right.end || left.ruleId.localeCompare(right.ruleId));
  const actualRows = actual
    .sort((left, right) => left.start - right.start || left.end - right.end || left.ruleId.localeCompare(right.ruleId));
  return JSON.stringify(actualRows) === JSON.stringify(expectedRows);
}

const linter = new Linter(await loadParser());
const mismatches: {
  id: string;
  actual: { ruleId: string; text: string; start: number; end: number }[];
  expected: ExpectedFinding[];
}[] = [];

for (const candidate of selected) {
  const config = candidate.mode === 'procedural' ? procedural : descriptive;
  const { lints } = await linter.lint(candidate.text, resolveConfig(config));
  const actual = lints
    .filter(({ ruleId }) => ruleId.startsWith('technical-english/'))
    .map(({ ruleId, text, start, end }) => ({ ruleId, text, start, end }));
  if (!findingsMatch(actual, candidate.expectedFindings)) {
    mismatches.push({ id: candidate.id, actual, expected: candidate.expectedFindings });
  }
}

console.log(`${split}: ${selected.length - mismatches.length}/${selected.length} provisional expectations matched.`);
if (mismatches.length && split !== 'final-holdout') {
  for (const mismatch of mismatches) {
    console.log(`\n${mismatch.id}`);
    console.log(`  expected ${JSON.stringify(mismatch.expected)}`);
    console.log(`  actual   ${JSON.stringify(mismatch.actual)}`);
  }
}
if (split === 'final-holdout') {
  console.log('Per-candidate final-holdout details are suppressed. Record whether the aggregate influenced detector decisions.');
}
if (mismatches.length) process.exitCode = 1;
