import { assignSplits, loadCandidates, type EvaluationSplit } from './dataset.js';

const seedIndex = process.argv.indexOf('--seed');
const seed = seedIndex === -1 ? 'ste-eval-v1' : process.argv[seedIndex + 1];
if (!seed) throw new Error('--seed requires a value.');

const assigned = assignSplits(loadCandidates(), seed);
const splits: EvaluationSplit[] = ['development', 'evaluation', 'reserved-public', 'final-holdout'];

console.log(`Technical-English candidate split for seed ${JSON.stringify(seed)}`);
for (const split of splits) {
  const records = assigned.filter((candidate) => candidate.split === split);
  const groups = new Set(records.map((candidate) => candidate.semanticFamilyId));
  console.log(`${split}: ${records.length} candidates in ${groups.size} semantic families`);
  for (const reference of ['3.6', '4.2', '5.1', '6.3', '6.6', '8.1']) {
    const count = records.filter((candidate) => candidate.primaryReference === reference).length;
    console.log(`  ${reference}: ${count}`);
  }
}
