// Which documents did best-of-n throw away?
//
//   npx tsx src/cli/selection-bias.ts --pool <pool.jsonl>
//
// The filter keeps a document only when one of its eight samples cut enough
// without losing facts. That is the right rule per document and a trap in
// aggregate: the documents the model handles worst are exactly the ones it
// fails to produce a usable sample for, so they leave the training set and the
// model never learns them. This prints the difficulty of what was kept against
// what was dropped, which is the only way to see that happen.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { loadConfig } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';

const { values } = parseArgs({ options: { pool: { type: 'string' }, chunk: { type: 'string', default: '40' } } });
const config = loadConfig();
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);

const rows = readFileSync(values.pool as string, 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as { source: string; kept: boolean });

const scored: { kept: boolean; d: 'prose' | 'technical'; s: number }[] = [];
const chunk = Number(values.chunk);
for (let i = 0; i < rows.length; i += chunk) {
  const batch = rows.slice(i, i + chunk);
  const texts = new Map<string, string>();
  batch.forEach((r, j) => texts.set(`s-${i + j}`, r.source));
  const f = await lintTexts(texts, config);
  batch.forEach((r, j) => {
    const w = weighFindings(f.get(`s-${i + j}`) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules);
    const t = scoreRewrite({ source: r.source, output: r.source, sourceFindings: w, outputFindings: w, config: config.reward });
    scored.push({ kept: r.kept, d: t.domain, s: t.sourceFindingsPer1kWords });
  });
  if (i % 400 === 0) console.log(`[bias] ${i}/${rows.length}`);
}

for (const d of ['prose', 'technical'] as const) {
  const g = scored.filter((s) => s.d === d);
  const kept = g.filter((s) => s.kept);
  const dropped = g.filter((s) => !s.kept);
  const words = (xs: typeof g) => mean(xs.map((x) => x.s));
  console.log(
    `\n${d}  n=${g.length}\n` +
      `  kept    n=${String(kept.length).padEnd(5)} mean source ${words(kept).toFixed(1)}/1k\n` +
      `  dropped n=${String(dropped.length).padEnd(5)} mean source ${words(dropped).toFixed(1)}/1k\n` +
      `  keep rate by difficulty:`,
  );
  for (const [lo, hi] of [[0, 15], [15, 25], [25, 35], [35, 999]] as const) {
    const band = g.filter((s) => s.s >= lo && s.s < hi);
    if (band.length === 0) continue;
    const k = band.filter((s) => s.kept).length;
    console.log(`    ${String(lo).padStart(3)}-${hi === 999 ? '+  ' : String(hi).padEnd(3)} n=${String(band.length).padEnd(5)} kept ${((100 * k) / band.length).toFixed(0)}%`);
  }
}
