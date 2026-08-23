// Does the student reach its own training targets on the documents it trained
// on?
//
//   npx tsx src/cli/train-recall.ts --arm v15train --arm basetrain
//
// This separates the only two explanations left for the plateau. v15 trained on
// targets cutting 31.5 weighted findings per 1k and evaluates at 26.1, against
// a base that already does 26.0. Either it learned the data and cannot carry it
// to unseen documents, or it never fit the data at all.
//
// Held-out evaluation cannot tell those apart. Running the student over its own
// training documents can: if it hits the target's number here and misses it on
// the benchmark, the problem is generalisation and the answer is more data. If
// it misses the target here too, it is undertrained, and the answer is more
// epochs, more rank, or a different optimiser -- all of which are free.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { faithfulness } from '../lib/faithfulness.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';

const { values } = parseArgs({
  options: {
    arm: { type: 'string', multiple: true, default: ['v15train', 'basetrain'] },
    data: { type: 'string', default: 'train/data/v15/train.jsonl' },
    chunk: { type: 'string', default: '30' },
  },
});

const config = loadConfig();
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

// The training pair itself, keyed by source, so the target the student was
// shown for a document can be scored beside what it now produces for it.
const targets = new Map<string, string>();
for (const line of readFileSync(values.data as string, 'utf8').split('\n')) {
  if (line.trim() === '') continue;
  const m = (JSON.parse(line) as { messages: { content: string }[] }).messages;
  const source = m[1].content.split('Simplify this:\n\n')[1] ?? m[1].content;
  targets.set(source.trim(), m[2].content.trim());
}

type Cand = { label: string; id: string; source: string; output: string };
const cands: Cand[] = [];
for (const arm of values.arm as string[]) {
  for (const line of readFileSync(path.join(runsDir, `drift-${arm}.jsonl`), 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    const row = JSON.parse(line) as { id: string; passes?: string[] };
    const p = row.passes ?? [];
    if (p.length < 2) continue;
    cands.push({ label: arm, id: row.id, source: p[0], output: p[1] });
  }
}
// The target is an arm too. It is the number the others are trying to reach.
for (const c of cands.filter((x) => x.label === (values.arm as string[])[0])) {
  const t = targets.get(c.source.trim());
  if (t !== undefined) cands.push({ label: 'target', id: c.id, source: c.source, output: t });
}

const byLabel = new Map<string, { cut: number[]; faith: number[]; len: number[] }>();
for (let start = 0; start < cands.length; start += Number(values.chunk)) {
  const batch = cands.slice(start, start + Number(values.chunk));
  const texts = new Map<string, string>();
  batch.forEach((c, i) => {
    texts.set(`s-${i}`, c.source);
    texts.set(`o-${i}`, c.output);
  });
  const f = await lintTexts(texts, config);
  const per1k = (k: string, n: number) =>
    (weighFindings(f.get(k) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules) * 1000) / n;
  batch.forEach((c, i) => {
    const sw = words(c.source);
    const ow = words(c.output);
    if (sw === 0 || ow === 0) return;
    const g = byLabel.get(c.label) ?? { cut: [], faith: [], len: [] };
    g.cut.push(per1k(`s-${i}`, sw) - per1k(`o-${i}`, ow));
    g.faith.push(faithfulness(c.source, c.output).keptRate);
    g.len.push(ow / sw);
    byLabel.set(c.label, g);
  });
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const ci = (x: number[]) => {
  const m = mean(x);
  const sd = Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, x.length - 1));
  return (1.96 * sd) / Math.sqrt(Math.max(1, x.length));
};

console.log(`\n${'arm'.padEnd(12)}${'n'.padStart(5)}${'cut'.padStart(9)}${'+/-'.padStart(8)}${'faith'.padStart(8)}${'length'.padStart(8)}`);
for (const [label, g] of byLabel) {
  console.log(
    label.padEnd(12) + String(g.cut.length).padStart(5) + mean(g.cut).toFixed(1).padStart(9) + ci(g.cut).toFixed(1).padStart(8) +
      mean(g.faith).toFixed(3).padStart(8) + mean(g.len).toFixed(3).padStart(8),
  );
}
console.log('\nThese are documents the student TRAINED on. "target" is the text it was shown.');
