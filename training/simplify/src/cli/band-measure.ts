// Percentiles of weighted findings per 1k over a directory of documents, in
// the units the reward actually prices.
//
//   npx tsx src/cli/band-measure.ts runs/docs-prose runs/docs-2018
//
// The bands in config.json are p10 to p75 of untouched human writing, and a
// guardrail in FIXED-POINT.md says to re-measure them whenever `levelWeights`,
// `scoredRules`, or the corpus changes. Nothing existed to do that.
// `measure-corpus.ts` looks close but answers a different question: it counts
// raw findings from both full rulepacks with no `scoredRules` filter, so its
// numbers are not in band units and reading them as though they were is how an
// audit concluded technical prose sits at 40 per 1k when it sits at 16.4.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { loadConfig, simplifyRoot } from '../lib/env.ts';
import { extractAnchors } from '../lib/faithfulness.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';

const dirs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (dirs.length === 0) throw new Error('usage: band-measure <dir> [dir...]');

const config = loadConfig();
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

console.log(
  `${'corpus'.padEnd(26)}${'n'.padStart(6)}${'p10'.padStart(8)}${'p25'.padStart(8)}${'p50'.padStart(8)}` +
    `${'p75'.padStart(8)}${'p90'.padStart(8)}${'anch/100'.padStart(10)}${'technical'.padStart(11)}`,
);

for (const dir of dirs) {
  const full = path.resolve(simplifyRoot, dir);
  const files = readdirSync(full).filter((f) => f.endsWith('.md'));
  const per1k: number[] = [];
  const anchors: number[] = [];
  const chunk = 60;
  for (let start = 0; start < files.length; start += chunk) {
    const batch = files.slice(start, start + chunk);
    const texts = new Map<string, string>();
    for (const file of batch) texts.set(file, readFileSync(path.join(full, file), 'utf8'));
    const findings = await lintTexts(texts, config);
    for (const [file, text] of texts) {
      const n = words(text);
      if (n < 40) continue;
      const weighted = weighFindings(findings.get(file) ?? [], config.reward.levelWeights, config.reward.scoredRules);
      per1k.push((weighted * 1000) / n);
      const a = extractAnchors(text);
      anchors.push((100 * (a.numbers.size + a.symbols.size)) / n);
    }
  }
  per1k.sort((a, b) => a - b);
  const sortedAnchors = [...anchors].sort((a, b) => a - b);
  const technical = anchors.filter((a) => a >= config.reward.technicalAnchorsPer100Words).length;
  console.log(
    path.basename(dir).padEnd(26) +
      String(per1k.length).padStart(6) +
      [0.1, 0.25, 0.5, 0.75, 0.9].map((q) => quantile(per1k, q).toFixed(1).padStart(8)).join('') +
      quantile(sortedAnchors, 0.5).toFixed(1).padStart(10) +
      `${((100 * technical) / Math.max(1, anchors.length)).toFixed(0)}%`.padStart(11),
  );
}
console.log('\nBands in config.json are p10 to p75. Re-measure and update both when the corpus moves.');
