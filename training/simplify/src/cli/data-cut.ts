import { readFileSync } from 'node:fs';
import { loadConfig } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';

const config = loadConfig();
const rows = readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as { kind: string; messages: { role: string; content: string }[] })
  .map((r) => ({ kind: r.kind, source: r.messages.at(-2)!.content.replace(/^Simplify this:\n\n/, ''), target: r.messages.at(-1)!.content }));

const cuts: number[] = [];
const srcs: number[] = [];
let noHeadroom = 0;
for (let s = 0; s < rows.length; s += 40) {
  const batch = rows.slice(s, s + 40);
  const texts = new Map<string, string>();
  batch.forEach((r, i) => { texts.set(`s-${s + i}`, r.source); texts.set(`t-${s + i}`, r.target); });
  const f = await lintTexts(texts, config);
  const w = (k: string) => weighFindings(f.get(k) ?? [], config.reward.levelWeights, config.reward.scoredRules);
  batch.forEach((r, i) => {
    const t = scoreRewrite({ source: r.source, output: r.target, sourceFindings: w(`s-${s + i}`), outputFindings: w(`t-${s + i}`), config: config.reward });
    cuts.push(t.sourceFindingsPer1kWords - t.findingsPer1kWords);
    srcs.push(t.sourceFindingsPer1kWords);
    if (t.sourceFindingsPer1kWords <= config.reward.domains[t.domain].band[1]) noHeadroom += 1;
  });
}
const sorted = [...cuts].sort((a, b) => a - b);
const q = (p: number) => sorted[Math.floor(sorted.length * p)];
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
console.log(`pairs ${cuts.length}`);
console.log(`source findings/1k mean ${mean(srcs).toFixed(1)}`);
console.log(`sources ALREADY IN BAND (nothing to cut): ${noHeadroom} (${((100 * noHeadroom) / cuts.length).toFixed(0)}%)`);
console.log(`target cut: p10 ${q(0.1).toFixed(1)}  median ${q(0.5).toFixed(1)}  p90 ${q(0.9).toFixed(1)}  mean ${mean(cuts).toFixed(1)}`);
console.log(`pairs whose target cut less than 3/1k: ${cuts.filter((c) => c < 3).length} (${((100 * cuts.filter((c) => c < 3).length) / cuts.length).toFixed(0)}%)`);
