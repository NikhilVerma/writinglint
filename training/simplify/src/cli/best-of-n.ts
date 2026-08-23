// Turns n samples per document into one training pair, or none.
//
//   npx tsx src/cli/best-of-n.ts --in samples-8b --out train/data/v14/train.jsonl
//
// Selection is by findings REMOVED, not by reward. Reward pays about 0.8 for
// handing a clean document back untouched, so ranking eight samples by reward
// picks the laziest one and teaches the student to copy — which is exactly what
// the v12 data did to a 1.7B. Ranking by what was actually cleaned cannot be
// satisfied by copying: a copy cuts zero and is rejected outright.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';
import { normalizeOutput } from '../lib/text.ts';

const { values } = parseArgs({
  options: {
    in: { type: 'string', default: 'samples-8b' },
    out: { type: 'string', default: 'train/data/v14/train.jsonl' },
    system: { type: 'string', default: 'prompts/rewrite-sft-v3.md' },
    'min-cut': { type: 'string', default: '3' },
    'min-faith': { type: 'string', default: '0.9' },
    'max-echo': { type: 'string', default: '0.9' },
    chunk: { type: 'string', default: '40' },
  },
});

const config = loadConfig();
const minCut = Number(values['min-cut']);
const minFaith = Number(values['min-faith']);
const maxEcho = Number(values['max-echo']);

const rows = readFileSync(path.join(runsDir, `${values.in}.jsonl`), 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as { source: string; outputs: string[] });

const system = readFileSync(values.system as string, 'utf8').trim();
const kept: string[] = [];
const cuts: number[] = [];
let rejected = 0;

for (let start = 0; start < rows.length; start += Number(values.chunk)) {
  const batch = rows.slice(start, start + Number(values.chunk));
  const texts = new Map<string, string>();
  batch.forEach((r, i) => {
    texts.set(`s-${start + i}`, r.source);
    r.outputs.forEach((o, j) => {
      const clean = normalizeOutput(o);
      if (clean.trim() !== '') texts.set(`o-${start + i}-${j}`, clean);
    });
  });
  const findings = await lintTexts(texts, config);
  const weigh = (key: string) =>
    weighFindings(findings.get(key) ?? [], config.reward.levelWeights, config.reward.scoredRules);

  batch.forEach((r, i) => {
    let best: { text: string; cut: number } | null = null;
    r.outputs.forEach((o, j) => {
      const clean = normalizeOutput(o);
      if (!texts.has(`o-${start + i}-${j}`)) return;
      const terms = scoreRewrite({
        source: r.source,
        output: clean,
        sourceFindings: weigh(`s-${start + i}`),
        outputFindings: weigh(`o-${start + i}-${j}`),
        config: config.reward,
      });
      const cut = terms.sourceFindingsPer1kWords - terms.findingsPer1kWords;
      // A sample that invents, drops facts, or barely changed the source is not
      // a target however much it cut.
      if (terms.degenerate || terms.anchorKeptRate < minFaith || terms.echoRate > maxEcho) return;
      if (cut < minCut) return;
      if (best === null || cut > best.cut) best = { text: clean, cut };
    });
    if (best === null) {
      rejected += 1;
      return;
    }
    cuts.push(best.cut);
    kept.push(
      JSON.stringify({
        kind: 'best-of-n',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Simplify this:\n\n${r.source}` },
          { role: 'assistant', content: best.text },
        ],
      }),
    );
  });
  console.error(`[best-of-n] ${Math.min(start + Number(values.chunk), rows.length)}/${rows.length} kept ${kept.length}`);
}

mkdirSync(path.dirname(values.out as string), { recursive: true });
writeFileSync(values.out as string, kept.map((l) => `${l}\n`).join(''), 'utf8');
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
console.log(
  `wrote ${kept.length} pairs to ${values.out} (${rejected} documents produced no usable sample)\n` +
    `mean cut of the kept samples ${mean(cuts).toFixed(1)} weighted findings per 1k`,
);
