// Did the second round beat the draft it started from?
//
//   npx tsx src/cli/fix-report.ts --in fix-probe
//
// The draft is already the best of eight blind samples. The revision only has
// to beat that one document, so this scores both against the SAME source and
// reports the difference. Anything else — comparing the revision to the mean
// sample, or to the source alone — flatters the loop.
//
// Faithfulness is reported next to the cut and not averaged into it. A revision
// that removes every finding by deleting the facts is not a better document,
// and the multiplicative reward already hides that trade behind one number.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite, type RewardTerms } from '../lib/reward.ts';
import { normalizeOutput } from '../lib/text.ts';

const { values } = parseArgs({
  options: {
    in: { type: 'string', default: 'fix-probe' },
    chunk: { type: 'string', default: '40' },
    minGain: { type: 'string', default: '2.0' },
    minFaith: { type: 'string', default: '0.90' },
  },
});

const config = loadConfig();
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const pct = (n: number, of: number) => `${((100 * n) / Math.max(1, of)).toFixed(0)}%`;
function stderr(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length);
}

const rows = readFileSync(path.join(runsDir, `${values.in as string}.jsonl`), 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as { id: string; source: string; draft: string; fixed: string })
  .map((r) => ({ ...r, fixed: normalizeOutput(r.fixed) }));

// A revision that came back empty is a failure of the loop, not a document to
// drop quietly: count it and score it as no improvement.
const empty = rows.filter((r) => r.fixed.trim() === '');
const usable = rows.filter((r) => r.fixed.trim() !== '');

const scored: { id: string; draft: RewardTerms; fixed: RewardTerms }[] = [];
const chunkSize = Number(values.chunk);
for (let start = 0; start < usable.length; start += chunkSize) {
  const batch = usable.slice(start, start + chunkSize);
  const texts = new Map<string, string>();
  batch.forEach((r, i) => {
    texts.set(`s-${start + i}`, r.source);
    texts.set(`d-${start + i}`, r.draft);
    texts.set(`f-${start + i}`, r.fixed);
  });
  const findings = await lintTexts(texts, config);
  const weigh = (key: string) =>
    weighFindings(findings.get(key) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules);
  batch.forEach((r, i) => {
    const src = weigh(`s-${start + i}`);
    scored.push({
      id: r.id,
      draft: scoreRewrite({ source: r.source, output: r.draft, sourceFindings: src, outputFindings: weigh(`d-${start + i}`), config: config.reward }),
      fixed: scoreRewrite({ source: r.source, output: r.fixed, sourceFindings: src, outputFindings: weigh(`f-${start + i}`), config: config.reward }),
    });
  });
  console.log(`[fix-report] scored ${Math.min(start + chunkSize, usable.length)}/${usable.length}`, );
}

const cutOf = (t: RewardTerms) => t.sourceFindingsPer1kWords - t.findingsPer1kWords;
const draftCut = scored.map((s) => cutOf(s.draft));
const fixedCut = scored.map((s) => cutOf(s.fixed));
const gain = scored.map((s) => cutOf(s.fixed) - cutOf(s.draft));
const faith = scored.map((s) => s.fixed.anchorKeptRate);

console.log(`\n${values.in}  ${scored.length} documents${empty.length > 0 ? `, ${empty.length} EMPTY revisions` : ''}\n`);
console.log(`  findings/1k   source ${mean(scored.map((s) => s.draft.sourceFindingsPer1kWords)).toFixed(1)} -> draft ${mean(scored.map((s) => s.draft.findingsPer1kWords)).toFixed(1)} -> fixed ${mean(scored.map((s) => s.fixed.findingsPer1kWords)).toFixed(1)}`);
console.log(`  cut           draft ${mean(draftCut).toFixed(1)}   fixed ${mean(fixedCut).toFixed(1)}`);
console.log(`  GAIN          ${mean(gain).toFixed(2)} +/-${(1.96 * stderr(gain)).toFixed(2)} (median ${median(gain).toFixed(2)})   better on ${pct(gain.filter((g) => g > 0).length, gain.length)} of documents`);
console.log(`  faithfulness  draft ${mean(scored.map((s) => s.draft.anchorKeptRate)).toFixed(3)}   fixed ${mean(faith).toFixed(3)}`);
console.log(`  length ratio  draft ${mean(scored.map((s) => s.draft.lengthRatio)).toFixed(3)}   fixed ${mean(scored.map((s) => s.fixed.lengthRatio)).toFixed(3)}`);
console.log(`  echo          draft ${mean(scored.map((s) => s.draft.echoRate)).toFixed(3)}   fixed ${mean(scored.map((s) => s.fixed.echoRate)).toFixed(3)}`);
console.log(`  degenerate    draft ${scored.filter((s) => s.draft.degenerate).length}   fixed ${scored.filter((s) => s.fixed.degenerate).length}`);

// The stop rule, checked by the machine so it cannot be talked around later.
const minGain = Number(values.minGain);
const minFaith = Number(values.minFaith);
const gainOk = mean(gain) >= minGain;
const faithOk = mean(faith) >= minFaith;
console.log(`\n  STOP RULE  gain >= ${minGain.toFixed(1)}: ${gainOk ? 'PASS' : 'FAIL'} (${mean(gain).toFixed(2)})   faithfulness >= ${minFaith.toFixed(2)}: ${faithOk ? 'PASS' : 'FAIL'} (${mean(faith).toFixed(3)})`);
console.log(`  ${gainOk && faithOk ? 'PASS - run the full set' : 'FAIL - do not run the full set, do not retrain'}`);
