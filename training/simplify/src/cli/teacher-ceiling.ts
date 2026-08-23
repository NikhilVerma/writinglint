// What does a stronger model actually cut on the benchmark documents?
//
//   npx tsx src/cli/teacher-ceiling.ts --dir <probe dir> --arm qwen8 --arm sft8bv15
//
// Four data-side fixes in a row landed on the base model's own behaviour, and
// the next lever costs real money or real GPU hours. Before spending either,
// this answers the question that decides between them: if a stronger model
// only cuts what the 8B already cuts, the metric is saturated and no teacher
// can help. If it cuts far more, there is a target worth distilling toward.
//
// Scored on BENCHMARK documents, which is legitimate for measuring a ceiling
// and illegitimate for training. Nothing here writes a training pair.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { faithfulness } from '../lib/faithfulness.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    arm: { type: 'string', multiple: true, default: ['qwen8', 'sft8bv15'] },
  },
});

const config = loadConfig();
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const dir = values.dir as string;
const index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8')) as { file: string; id: string }[];

interface Cand { label: string; id: string; source: string; output: string }
const cands: Cand[] = [];

for (const entry of index) {
  const source = readFileSync(path.join(dir, entry.file), 'utf8');
  const outFile = path.join(dir, entry.file.replace(/\.md$/, '.out.md'));
  if (existsSync(outFile)) cands.push({ label: 'teacher', id: entry.id, source, output: readFileSync(outFile, 'utf8').trim() });
}

for (const arm of values.arm as string[]) {
  const rows = readFileSync(path.join(runsDir, `drift-${arm}.jsonl`), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as { id: string; passes: string[] });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const entry of index) {
    const row = byId.get(entry.id);
    if (!row) continue;
    cands.push({ label: arm, id: entry.id, source: row.passes[0] ?? '', output: row.passes[1] ?? '' });
  }
}

const texts = new Map<string, string>();
cands.forEach((c, i) => {
  texts.set(`s-${i}`, c.source);
  texts.set(`o-${i}`, c.output);
});
const f = await lintTexts(texts, config);

const per1k = (findings: unknown[], n: number) =>
  (weighFindings(findings as never, config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules) * 1000) / n;

const byLabel = new Map<string, { cut: number[]; faith: number[]; len: number[]; out: number[] }>();
cands.forEach((c, i) => {
  if (words(c.source) === 0 || words(c.output) === 0) return;
  const s = per1k(f.get(`s-${i}`) ?? [], words(c.source));
  const o = per1k(f.get(`o-${i}`) ?? [], words(c.output));
  const g = byLabel.get(c.label) ?? { cut: [], faith: [], len: [], out: [] };
  g.cut.push(s - o);
  g.out.push(o);
  g.faith.push(faithfulness(c.source, c.output).keptRate);
  g.len.push(words(c.output) / words(c.source));
  byLabel.set(c.label, g);
});

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const ci = (x: number[]) => {
  const m = mean(x);
  const sd = Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, x.length - 1));
  return (1.96 * sd) / Math.sqrt(x.length);
};

console.log(`\n${'arm'.padEnd(12)}${'n'.padStart(4)}${'out/1k'.padStart(9)}${'cut'.padStart(9)}${'+/-'.padStart(8)}${'faith'.padStart(8)}${'length'.padStart(8)}`);
for (const [label, g] of byLabel) {
  console.log(
    label.padEnd(12) + String(g.cut.length).padStart(4) + mean(g.out).toFixed(1).padStart(9) +
      mean(g.cut).toFixed(1).padStart(9) + ci(g.cut).toFixed(1).padStart(8) +
      mean(g.faith).toFixed(3).padStart(8) + mean(g.len).toFixed(3).padStart(8),
  );
}

// Paired against the base arm, because 12 documents is far too few for
// independent means to separate anything.
const base = values.arm[0] as string;
for (const [label, _g] of byLabel) {
  if (label === base) continue;
  const d: number[] = [];
  for (const entry of index) {
    const a = cands.find((c) => c.label === label && c.id === entry.id);
    const b = cands.find((c) => c.label === base && c.id === entry.id);
    if (!a || !b) continue;
    const ia = cands.indexOf(a);
    const ib = cands.indexOf(b);
    if (words(a.output) === 0 || words(b.output) === 0) continue;
    d.push(
      (per1k(f.get(`s-${ia}`) ?? [], words(a.source)) - per1k(f.get(`o-${ia}`) ?? [], words(a.output))) -
        (per1k(f.get(`s-${ib}`) ?? [], words(b.source)) - per1k(f.get(`o-${ib}`) ?? [], words(b.output))),
    );
  }
  if (d.length === 0) continue;
  const m = mean(d);
  const c = ci(d);
  console.log(
    `\npaired ${label} minus ${base}: ${m >= 0 ? '+' : ''}${m.toFixed(2)} +/-${c.toFixed(2)} over ${d.length} documents  ` +
      `(ahead on ${((100 * d.filter((x) => x > 0).length) / d.length).toFixed(0)}%)  ` +
      `${Math.abs(m) > c ? (m > 0 ? 'REAL' : 'WORSE') : 'SAME'}`,
  );
}
