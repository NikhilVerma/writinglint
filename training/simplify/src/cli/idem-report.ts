import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';

// Aggregates scored idempotence runs into a comparison table.
//
//   npx tsx src/cli/idem-report.ts --arm base --arm v7 --arm sft-v8
//
// Draws are averaged within a document first, then the spread is taken across
// documents. Documents are the independent unit; the k draws are repeat
// measurements of the same one, so pooling all 360 rows would understate the
// error bars by treating three draws of one essay as three essays.

const { values } = parseArgs({
  options: {
    arm: { type: 'string', multiple: true, default: ['base', 'v7'] },
    baseline: { type: 'string', default: 'base' },
  },
});

interface Scored {
  id: string;
  reward: number;
  echoRate: number;
  lengthRatio: number;
  anchorKeptRate: number;
  findingsPer1kWords: number;
  sourceFindingsPer1kWords: number;
}

const METRICS = [
  ['echoRate', 'echoRate (1=unchanged)'],
  ['lengthRatio', 'lengthRatio'],
  ['anchorKeptRate', 'anchorKeptRate'],
  ['findingsPer1kWords', 'out weighted/1k'],
  ['reward', 'reward'],
] as const;

const load = (arm: string): Map<string, Scored[]> => {
  const file = path.join(runsDir, `idem-${arm}.scored.jsonl`);
  const byDoc = new Map<string, Scored[]>();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    const row = JSON.parse(line) as Scored;
    const doc = row.id.split('#')[0];
    const list = byDoc.get(doc);
    if (list) list.push(row);
    else byDoc.set(doc, [row]);
  }
  return byDoc;
};

/** Mean and standard error over documents. */
const stat = (values: number[]): [number, number] => {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return [mean, 0];
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return [mean, Math.sqrt(variance / n)];
};

const arms = values.arm as string[];
const loaded = new Map(arms.map((arm) => [arm, load(arm)]));
// Only documents every arm produced, so the columns compare like with like.
const docs = [...(loaded.get(arms[0]) ?? new Map()).keys()]
  .filter((doc) => arms.every((arm) => loaded.get(arm)?.has(doc)))
  .sort();
if (docs.length === 0) throw new Error('no documents shared across every arm');

const perDoc = (arm: string, key: keyof Scored): number[] =>
  docs.map((doc) => {
    const rows = loaded.get(arm)!.get(doc)!;
    return rows.reduce((a, r) => a + (r[key] as number), 0) / rows.length;
  });

const [bandLow, bandHigh] = loadConfig().reward.humanBand;
const srcMean = stat(perDoc(arms[0], 'sourceFindingsPer1kWords'))[0];
const clean = perDoc(arms[0], 'sourceFindingsPer1kWords').filter((v) => v >= bandLow && v <= bandHigh).length;

console.log(`documents=${docs.length}  draws/doc=${loaded.get(arms[0])!.get(docs[0])!.length}`);
console.log(`source prose: ${srcMean.toFixed(2)} weighted findings/1k`);
console.log(`already inside the band [${bandLow},${bandHigh}]: ${clean}/${docs.length} (${Math.round((clean / docs.length) * 100)}%)\n`);

const pad = (s: string, n: number) => s.padEnd(n);
const cell = (m: number, e: number) => `${m.toFixed(3)}±${e.toFixed(3)}`.padStart(15);
console.log(pad('metric', 24) + arms.map((a) => a.padStart(15)).join('') + '   vs ' + values.baseline);
for (const [key, label] of METRICS) {
  const cells = arms.map((arm) => cell(...stat(perDoc(arm, key))));
  const ref = perDoc(values.baseline as string, key);
  const deltas = arms
    .filter((a) => a !== values.baseline)
    .map((arm) => {
      const [dm, dse] = stat(perDoc(arm, key).map((v, i) => v - ref[i]));
      // Two standard errors is the bar for calling a paired difference real.
      return `${dm >= 0 ? '+' : ''}${dm.toFixed(3)}±${dse.toFixed(3)}${Math.abs(dm) > 2 * dse ? '*' : ' '}`;
    });
  console.log(pad(label, 24) + cells.join('') + '   ' + deltas.join('  '));
}

console.log();
for (const arm of arms) {
  const rows = docs.flatMap((doc) => loaded.get(arm)!.get(doc)!);
  const below = rows.filter((r) => r.findingsPer1kWords < bandLow).length;
  console.log(`${pad(arm, 10)} scrubbed below the band floor: ${below}/${rows.length} (${Math.round((below / rows.length) * 100)}%)`);
}
console.log('\n* = differs from zero by more than 2 standard errors');
