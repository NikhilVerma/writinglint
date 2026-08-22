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

for (const arm of values.arm as string[]) {
  const file = path.join(runsDir, `drift-${arm}.jsonl`);
  const rows = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as { id: string; passes: string[] });

  const passCount = rows[0].passes.length - 1;
  console.log(`\n${arm}  (n=${rows.length})`);
  console.log(`${'transition'.padEnd(14)}${'drift mean'.padStart(12)}${'median'.padStart(10)}${'p90'.padStart(10)}${'len ratio'.padStart(11)}`);
  for (let p = 0; p < passCount; p += 1) {
    const drifts: number[] = [];
    const ratios: number[] = [];
    for (const row of rows) {
      const before = row.passes[p];
      const after = row.passes[p + 1];
      if (before.trim() === '' || after.trim() === '') continue;
      drifts.push(1 - echoRate(before, after));
      ratios.push(wordsOf(after) / Math.max(1, wordsOf(before)));
    }
    drifts.sort((a, b) => a - b);
    const mean = drifts.reduce((a, b) => a + b, 0) / drifts.length;
    const lenMean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const label = p === 0 ? 'input -> p1' : `p${p} -> p${p + 1}`;
    console.log(
      label.padEnd(14) +
        `${(mean * 100).toFixed(1)}%`.padStart(12) +
        `${(quantile(drifts, 0.5) * 100).toFixed(1)}%`.padStart(10) +
        `${(quantile(drifts, 0.9) * 100).toFixed(1)}%`.padStart(10) +
        lenMean.toFixed(3).padStart(11),
    );
  }
}
console.log('\ndrift = share of 4-grams that changed. Target: high on pass 1, under 2% after.');
