// Does the base model improve its own output when run over it again, and is
// that improvement systematic rather than lucky?
//
//   npx tsx src/cli/pass-headroom.ts --arm qwen8
//
// Best-of-8 selection turned out to be the top of a noise distribution: the
// headroom it offers matches what independent draws predict, so there is no
// trait a student could learn from the winner. Iterated refinement is the
// other way to get a better output from the same model, and it fails or
// succeeds for the opposite reason. Every document goes through the same
// procedure, so if pass two beats pass one on most documents with a tight
// interval, the gain is caused rather than selected — and a student can be
// taught to do in one pass what the model currently needs three to reach.
//
// Paired per document, and reported per pass, because the question is not only
// whether refinement helps but whether it keeps helping or stalls.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { faithfulness } from '../lib/faithfulness.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';

const { values } = parseArgs({
  options: {
    arm: { type: 'string', default: 'qwen8' },
    chunk: { type: 'string', default: '25' },
    slice: { type: 'string' },
  },
});

const config = loadConfig();
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

const rows = readFileSync(path.join(runsDir, `drift-${values.arm as string}.jsonl`), 'utf8')
  .split('\n').filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as { id: string; slice?: string; passes: string[] })
  .filter((r) => values.slice === undefined || r.slice === values.slice);

const depth = Math.max(...rows.map((r) => r.passes.length)) - 1;
type Doc = { id: string; cut: number[]; faith: number[]; len: number[] };
const docs: Doc[] = [];

for (let start = 0; start < rows.length; start += Number(values.chunk)) {
  const batch = rows.slice(start, start + Number(values.chunk));
  const texts = new Map<string, string>();
  batch.forEach((r, i) => r.passes.forEach((p, k) => { if (p.trim() !== '') texts.set(`p-${i}-${k}`, p); }));
  const f = await lintTexts(texts, config);
  const per1k = (key: string, n: number) =>
    (weighFindings(f.get(key) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules) * 1000) / n;

  batch.forEach((r, i) => {
    const src = r.passes[0] ?? '';
    const sw = words(src);
    if (sw === 0 || r.passes.length < depth + 1) return;
    const s1k = per1k(`p-${i}-0`, sw);
    const cut: number[] = [];
    const faith: number[] = [];
    const len: number[] = [];
    for (let k = 1; k <= depth; k += 1) {
      const p = r.passes[k] ?? '';
      const ow = words(p);
      if (ow === 0) return;
      cut.push(s1k - per1k(`p-${i}-${k}`, ow));
      faith.push(faithfulness(src, p).keptRate);
      len.push(ow / sw);
    }
    docs.push({ id: r.id, cut, faith, len });
  });
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const ci = (x: number[]) => {
  const m = mean(x);
  const s = Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, x.length - 1));
  return (1.96 * s) / Math.sqrt(Math.max(1, x.length));
};

console.log(`\n${values.arm}${values.slice === undefined ? '' : `, slice ${values.slice}`}, ${docs.length} documents\n`);
console.log(`${'pass'.padEnd(6)}${'cut'.padStart(8)}${'faith'.padStart(8)}${'length'.padStart(8)}`);
for (let k = 0; k < depth; k += 1) {
  console.log(
    String(k + 1).padEnd(6) + mean(docs.map((d) => d.cut[k])).toFixed(2).padStart(8) +
      mean(docs.map((d) => d.faith[k])).toFixed(3).padStart(8) + mean(docs.map((d) => d.len[k])).toFixed(3).padStart(8),
  );
}

// Paired against pass one, which is what a single-pass student has to beat.
for (let k = 1; k < depth; k += 1) {
  const d = docs.map((doc) => doc.cut[k] - doc.cut[0]);
  const m = mean(d);
  const c = ci(d);
  console.log(
    `\npaired pass ${k + 1} minus pass 1: ${m >= 0 ? '+' : ''}${m.toFixed(2)} +/-${c.toFixed(2)} over ${d.length} documents  ` +
      `(ahead on ${((100 * d.filter((x) => x > 0).length) / d.length).toFixed(0)}%)  ` +
      `${Math.abs(m) > c ? (m > 0 ? 'BETTER' : 'WORSE') : 'SAME'}`,
  );
}
