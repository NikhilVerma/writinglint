import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { runsDir } from '../lib/env.ts';
import { echoRate } from '../lib/faithfulness.ts';

// Reports how much a model changes text on each successive pass over its own
// output.
//
//   npx tsx src/cli/drift-report.ts --arm base --arm v7 --arm sft-v9
//
// Pass 1 drift is the work: a dirty document should change a lot. Pass 2 drift
// is the defect: rerunning the model on its own output should barely move it.
// The ratio between them is the thing to watch — a model that changes 40% then
// 20% is churning, one that changes 40% then 2% has a fixed point.

const { values } = parseArgs({
  options: { arm: { type: 'string', multiple: true, default: ['base'] } },
});

const wordsOf = (t: string) => t.split(/\s+/).filter((w) => w !== '').length;

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** Standard error of the mean, over documents. */
function stderr(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance / xs.length);
}

/** Average the draws within each document, then treat documents as the unit.
 *
 * The benchmark samples the same document more than once: 155 rows over 63
 * unique ids, about 2.5 draws each. Two draws of one Paul Graham essay are not
 * two independent measurements of the model, so counting them as such shrinks
 * every interval by roughly the square root of the draw count. Every drift
 * confidence interval reported before this fix was too narrow. */
function byDocument(values: Map<string, number[]>): number[] {
  return [...values.values()].map(mean);
}

for (const arm of values.arm as string[]) {
  const file = path.join(runsDir, `drift-${arm}.jsonl`);
  const rows = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as { id: string; passes: string[] });

  const passCount = rows[0].passes.length - 1;
  const documents = new Set(rows.map((r) => r.id)).size;
  console.log(`\n${arm}  (${rows.length} rows over ${documents} documents)`);
  console.log(
    `${'transition'.padEnd(14)}${'drift mean'.padStart(12)}${'+/-95%'.padStart(9)}${'median'.padStart(9)}${'p90'.padStart(9)}${'len ratio'.padStart(11)}`,
  );
  for (let p = 0; p < passCount; p += 1) {
    const drifts = new Map<string, number[]>();
    const ratios = new Map<string, number[]>();
    for (const row of rows) {
      const before = row.passes[p];
      const after = row.passes[p + 1];
      if (before.trim() === '' || after.trim() === '') continue;
      if (!drifts.has(row.id)) drifts.set(row.id, []);
      if (!ratios.has(row.id)) ratios.set(row.id, []);
      (drifts.get(row.id) as number[]).push(1 - echoRate(before, after));
      (ratios.get(row.id) as number[]).push(wordsOf(after) / Math.max(1, wordsOf(before)));
    }
    const perDoc = byDocument(drifts).sort((a, b) => a - b);
    const label = p === 0 ? 'input -> p1' : `p${p} -> p${p + 1}`;
    console.log(
      label.padEnd(14) +
        `${(mean(perDoc) * 100).toFixed(1)}%`.padStart(12) +
        `${(1.96 * stderr(perDoc) * 100).toFixed(1)}`.padStart(9) +
        `${(quantile(perDoc, 0.5) * 100).toFixed(1)}%`.padStart(9) +
        `${(quantile(perDoc, 0.9) * 100).toFixed(1)}%`.padStart(9) +
        mean(byDocument(ratios)).toFixed(3).padStart(11),
    );
  }
}
console.log('\ndrift = share of 4-grams that changed. Target: high on pass 1, under 2% after.');
