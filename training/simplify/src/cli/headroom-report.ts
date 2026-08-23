// The ceiling on self-distillation, measured instead of assumed.
//
//   npx tsx src/cli/headroom-report.ts --in headroom-8b
//
// Rejection-sampling SFT teaches a model to hit its own best-of-n. So the most
// it can ever buy is the distance between the average sample and the best one.
// If that distance is small on the documents the model is graded on, no amount
// of resampling this model will help and the targets have to come from outside
// it. Reported on the benchmark's hard prose, which is the slice that has not
// moved for two model generations.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite, type RewardTerms } from '../lib/reward.ts';
import { normalizeOutput } from '../lib/text.ts';

const { values } = parseArgs({
  options: { in: { type: 'string', default: 'headroom-8b' }, chunk: { type: 'string', default: '12' }, minFaith: { type: 'string', default: '0.9' } },
});

const config = loadConfig();
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const median = (x: number[]) => [...x].sort((a, b) => a - b)[Math.floor(x.length / 2)] ?? 0;
function stderr(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length);
}

const rows = readFileSync(path.join(runsDir, `${values.in as string}.jsonl`), 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as { source: string; outputs: string[] });

const perDoc: { avg: number; best: number; bestFaith: number; avgFaith: number }[] = [];
const chunk = Number(values.chunk);
const minFaith = Number(values.minFaith);
for (let i = 0; i < rows.length; i += chunk) {
  const batch = rows.slice(i, i + chunk);
  const texts = new Map<string, string>();
  batch.forEach((r, j) => {
    texts.set(`s-${i + j}`, r.source);
    r.outputs.forEach((o, k) => texts.set(`o-${i + j}-${k}`, normalizeOutput(o)));
  });
  const found = await lintTexts(texts, config);
  const w = (k: string) => weighFindings(found.get(k) ?? [], config.reward.levelWeights, config.reward.scoredRules);
  batch.forEach((r, j) => {
    const src = w(`s-${i + j}`);
    const terms: RewardTerms[] = r.outputs.map((o, k) =>
      scoreRewrite({ source: r.source, output: normalizeOutput(o), sourceFindings: src, outputFindings: w(`o-${i + j}-${k}`), config: config.reward }),
    );
    const cuts = terms.map((t) => t.sourceFindingsPer1kWords - t.findingsPer1kWords);
    // Best-of-n as the training filter actually applies it: the luckiest sample
    // that did not drop facts. Ranking on cut alone would let a deletion win.
    const usable = terms.map((t, k) => ({ t, cut: cuts[k] })).filter((x) => x.t.anchorKeptRate >= minFaith && !x.t.degenerate);
    const best = usable.length > 0 ? usable.reduce((a, b) => (b.cut > a.cut ? b : a)) : null;
    perDoc.push({
      avg: mean(cuts),
      best: best ? best.cut : mean(cuts),
      bestFaith: best ? best.t.anchorKeptRate : mean(terms.map((t) => t.anchorKeptRate)),
      avgFaith: mean(terms.map((t) => t.anchorKeptRate)),
    });
  });
  console.log(`[headroom] ${Math.min(i + chunk, rows.length)}/${rows.length}`);
}

const gap = perDoc.map((d) => d.best - d.avg);
console.log(`\n${values.in}  ${perDoc.length} benchmark prose documents that need work, 8 samples each\n`);
console.log(`  average sample cut   ${mean(perDoc.map((d) => d.avg)).toFixed(1)}   faithfulness ${mean(perDoc.map((d) => d.avgFaith)).toFixed(3)}`);
console.log(`  best-of-8 cut        ${mean(perDoc.map((d) => d.best)).toFixed(1)}   faithfulness ${mean(perDoc.map((d) => d.bestFaith)).toFixed(3)}`);
console.log(`  HEADROOM             ${mean(gap).toFixed(2)} +/-${(1.96 * stderr(gap)).toFixed(2)} (median ${median(gap).toFixed(2)})`);
console.log(`\nHeadroom is the entire budget a perfect self-distillation run could spend.`);
