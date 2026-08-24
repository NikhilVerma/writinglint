// Is best-of-8 a policy a student can learn, or the top of a noise distribution?
//
//   npx tsx src/cli/selection-anatomy.ts --samples v15-samples --prompts v15-prompts
//
// v16 reproduced its best-of-8 targets exactly on documents it trained on and
// carried none of it to documents it did not. The obvious reading is too little
// data. The other reading is that there was never a function to learn: if the
// eight draws differ from each other only by sampling luck, then the highest
// scoring one is the top of a noise distribution, "more data" cannot help, and
// a student can do nothing with the target except memorise which lucky draw
// went with which document — which is exactly the pair of results observed.
//
// Two measurements separate them.
//
//   The order statistic. The expected maximum of n independent draws sits
//   about 1.42 within-document standard deviations above their mean at n=8.
//   If the measured headroom matches what pure noise predicts, selection is
//   finding nothing a rewriter did differently.
//
//   The proxy. If the winning draw is reliably the shortest draw, then the
//   policy is "compress harder", which is learnable and transferable, and the
//   v16 failure is about training rather than about targets. Selecting by
//   length alone and scoring the result says how much of the headroom a
//   student could capture from a rule it can actually follow.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';
import { normalizeOutput } from '../lib/text.ts';

const { values } = parseArgs({
  options: {
    samples: { type: 'string', default: 'v15-samples' },
    prompts: { type: 'string', default: 'v15-prompts' },
    chunk: { type: 'string', default: '20' },
    limit: { type: 'string', default: '0' },
    // The same gates best-of-n applies before it selects, so this measures the
    // pool the dataset was actually drawn from.
    'min-faith': { type: 'string', default: '0.9' },
    'max-echo': { type: 'string', default: '0.9' },
  },
});

const config = loadConfig();
const minFaith = Number(values['min-faith']);
const maxEcho = Number(values['max-echo']);
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

const jsonl = (name: string) =>
  readFileSync(path.join(runsDir, `${name}.jsonl`), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
const promptRows = jsonl(values.prompts as string) as { id: string; source: string }[];
const sampleRows = jsonl(values.samples as string) as { source: string; outputs: string[] }[];
if (promptRows.length !== sampleRows.length) {
  throw new Error(`${values.prompts} has ${promptRows.length} rows and ${values.samples} has ${sampleRows.length}; they cannot be zipped`);
}
let items = promptRows.map((p, i) => {
  if (p.source.trim() !== sampleRows[i].source.trim()) throw new Error(`row ${i} sources differ between prompts and samples`);
  return { id: p.id, source: p.source, outputs: sampleRows[i].outputs };
});
if (Number(values.limit) > 0) items = items.slice(0, Number(values.limit));

type Row = {
  id: string;
  cuts: number[];
  lens: number[];
};
const rows: Row[] = [];

for (let start = 0; start < items.length; start += Number(values.chunk)) {
  const batch = items.slice(start, start + Number(values.chunk));
  const texts = new Map<string, string>();
  batch.forEach((it, i) => {
    texts.set(`s-${i}`, it.source);
    it.outputs.forEach((o, j) => {
      const clean = normalizeOutput(o);
      if (clean.trim() !== '') texts.set(`o-${i}-${j}`, clean);
    });
  });
  const f = await lintTexts(texts, config);
  const per1k = (key: string, n: number) =>
    (weighFindings(f.get(key) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules) * 1000) / n;

  batch.forEach((it, i) => {
    const sw = words(it.source);
    if (sw === 0) return;
    const s1k = per1k(`s-${i}`, sw);
    const cuts: number[] = [];
    const lens: number[] = [];
    it.outputs.forEach((o, j) => {
      const clean = normalizeOutput(o);
      const key = `o-${i}-${j}`;
      if (!texts.has(key)) return;
      const ow = words(clean);
      if (ow === 0) return;
      const terms = scoreRewrite({
        source: it.source,
        output: clean,
        sourceFindings: weighFindings(f.get(`s-${i}`) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules),
        outputFindings: weighFindings(f.get(key) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules),
        config: config.reward,
      });
      if (terms.degenerate || terms.anchorKeptRate < minFaith || terms.echoRate > maxEcho) return;
      cuts.push(s1k - per1k(key, ow));
      lens.push(ow / sw);
    });
    // Fewer than four surviving draws cannot support a split-half comparison
    // and would bias the order statistic toward whichever documents happened
    // to produce degenerate samples.
    if (cuts.length >= 4) rows.push({ id: it.id, cuts, lens });
  });
  console.log(`[anatomy] ${Math.min(start + Number(values.chunk), items.length)}/${items.length}`);
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const sd = (x: number[]) => {
  const m = mean(x);
  return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, x.length - 1));
};
const ci = (x: number[]) => (1.96 * sd(x)) / Math.sqrt(Math.max(1, x.length));

/**
 * Expected maximum of n standard normal draws. Tabulated rather than derived,
 * because the whole point is to compare against a number nothing in this file
 * can quietly tune.
 */
const EXPECTED_MAX = [0, 0, 0.5642, 0.8463, 1.0294, 1.1630, 1.2672, 1.3522, 1.4236, 1.4850, 1.5388];

const headroom: number[] = [];
const predicted: number[] = [];
const bestCuts: number[] = [];
const meanCuts: number[] = [];
const shortestCuts: number[] = [];
const withinCorr: number[] = [];
const drawSds: number[] = [];

for (const r of rows) {
  const n = r.cuts.length;
  const m = mean(r.cuts);
  const s = sd(r.cuts);
  const best = Math.max(...r.cuts);
  const shortIdx = r.lens.indexOf(Math.min(...r.lens));
  headroom.push(best - m);
  predicted.push((EXPECTED_MAX[Math.min(n, EXPECTED_MAX.length - 1)] ?? 1.42) * s);
  bestCuts.push(best);
  meanCuts.push(m);
  shortestCuts.push(r.cuts[shortIdx]);
  drawSds.push(s);
  // Within one document, does the shorter draw score better? Pearson across
  // the draws of this document alone, so document difficulty cannot drive it.
  const lm = mean(r.lens);
  const ls = sd(r.lens);
  if (s > 0 && ls > 0) {
    let cov = 0;
    for (let i = 0; i < n; i += 1) cov += (r.cuts[i] - m) * (r.lens[i] - lm);
    withinCorr.push(cov / ((n - 1) * s * ls));
  }
}

console.log(`\n${rows.length} documents with at least four surviving draws\n`);
console.log(`within-document sd of cut        ${mean(drawSds).toFixed(2)}`);
console.log(`observed headroom, best - mean  +${mean(headroom).toFixed(2)} +/-${ci(headroom).toFixed(2)}`);
console.log(`predicted by noise alone        +${mean(predicted).toFixed(2)} +/-${ci(predicted).toFixed(2)}`);
const gap = rows.map((_r, i) => headroom[i] - predicted[i]);
console.log(
  `observed minus predicted        ${mean(gap) >= 0 ? '+' : ''}${mean(gap).toFixed(2)} +/-${ci(gap).toFixed(2)}  ` +
    `${Math.abs(mean(gap)) > ci(gap) ? (mean(gap) > 0 ? 'SIGNAL' : 'LESS THAN NOISE') : 'INDISTINGUISHABLE FROM NOISE'}`,
);

console.log(`\n${'selection'.padEnd(16)}${'cut'.padStart(8)}`);
console.log('best of n'.padEnd(16) + mean(bestCuts).toFixed(2).padStart(8));
console.log('shortest of n'.padEnd(16) + mean(shortestCuts).toFixed(2).padStart(8));
console.log('mean of n'.padEnd(16) + mean(meanCuts).toFixed(2).padStart(8));
const captured = (mean(shortestCuts) - mean(meanCuts)) / (mean(bestCuts) - mean(meanCuts));
console.log(`\nlength alone captures ${(100 * captured).toFixed(0)}% of the headroom`);
console.log(
  `within-document correlation between cut and length ratio: ${mean(withinCorr).toFixed(3)} +/-${ci(withinCorr).toFixed(3)} over ${withinCorr.length} documents`,
);

// Split-half agreement: is this selector a policy or a lottery?
//
// A selector is learnable when the target it names does not depend on which
// draws it happened to see. Split the draws into two halves, run the selector
// on each, and compare the two answers. If a selector picks the same KIND of
// text from either half, a student has something consistent to imitate. If the
// two halves name texts of very different length, the selector is choosing
// among near-equivalent draws for reasons the student cannot reproduce.
//
// Reported as the gap in length ratio between the two answers, against the
// spread of lengths in the document, so a document whose draws all came out
// the same length cannot look like agreement.
const agreement = (pick: (cuts: number[], lens: number[]) => number) => {
  const gaps: number[] = [];
  for (const r of rows) {
    const n = r.cuts.length;
    const half = Math.floor(n / 2);
    if (half < 2) continue;
    const aC = r.cuts.slice(0, half);
    const aL = r.lens.slice(0, half);
    const bC = r.cuts.slice(half, half * 2);
    const bL = r.lens.slice(half, half * 2);
    const spread = sd(r.lens);
    if (spread === 0) continue;
    gaps.push(Math.abs(aL[pick(aC, aL)] - bL[pick(bC, bL)]) / spread);
  }
  return gaps;
};
const byCut = agreement((c) => c.indexOf(Math.max(...c)));
const byLen = agreement((_c, l) => l.indexOf(Math.min(...l)));
console.log(`\nsplit-half disagreement, in within-document sds of length ratio (lower is a more consistent selector)`);
console.log(`  highest cut   ${mean(byCut).toFixed(2)} +/-${ci(byCut).toFixed(2)} over ${byCut.length} documents`);
console.log(`  shortest      ${mean(byLen).toFixed(2)} +/-${ci(byLen).toFixed(2)} over ${byLen.length} documents`);
