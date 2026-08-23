// Splits "the model is too small" into two claims that predict different data.
//
//   npx tsx src/cli/length-curve.ts --arm smol135 --arm smol360 --arm qwen8
//
// A model that cannot hold a long document loses faithfulness AS THE SOURCE
// GETS LONGER, and is fine on short ones. A model that lacks the knowledge to
// simplify is flat in length and separates by domain instead: technical prose
// stays bad even when it is short. The two are confounded in every aggregate
// number we have, and they call for different fixes — more context capacity in
// the student, versus a better teacher and more data.

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
    arm: { type: 'string', multiple: true, default: ['base'] },
    chunk: { type: 'string', default: '60' },
  },
});

const config = loadConfig();
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const words = (t: string) => t.split(/\s+/).filter((w) => w !== '').length;

/** Bins chosen so each holds a usable number of the 183 benchmark documents. */
const BINS = [0, 250, 500, 1000, 2000, Number.POSITIVE_INFINITY];
const binLabel = (n: number) => {
  const i = BINS.findIndex((b, k) => n >= b && n < BINS[k + 1]);
  return i === BINS.length - 2 ? `${BINS[i]}+` : `${BINS[i]}-${BINS[i + 1]}`;
};

for (const arm of values.arm as string[]) {
  const rows = readFileSync(path.join(runsDir, `drift-${arm}.jsonl`), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as { id: string; passes: string[] })
    .map((r) => ({ id: r.id, input: r.passes[0], output: normalizeOutput(r.passes[1] ?? '') }))
    .filter((r) => r.input.trim() !== '');

  const scored: { bin: string; empty: boolean; value: RewardTerms | null }[] = [];
  const chunkSize = Number(values.chunk);
  for (let start = 0; start < rows.length; start += chunkSize) {
    const batch = rows.slice(start, start + chunkSize);
    const live = batch.filter((r) => r.output.trim() !== '');
    const texts = new Map<string, string>();
    live.forEach((r, i) => {
      texts.set(`i-${start + i}`, r.input);
      texts.set(`o-${start + i}`, r.output);
    });
    const findings = await lintTexts(texts, config);
    const weigh = (key: string) =>
      weighFindings(findings.get(key) ?? [], config.reward.levelWeights, config.reward.scoredRules);
    for (const r of batch) {
      const i = live.indexOf(r);
      scored.push({
        bin: binLabel(words(r.input)),
        empty: i < 0,
        value:
          i < 0
            ? null
            : scoreRewrite({
                source: r.input,
                output: r.output,
                sourceFindings: weigh(`i-${start + i}`),
                outputFindings: weigh(`o-${start + i}`),
                config: config.reward,
              }),
      });
    }
  }

  console.log(`\n${arm}`);
  console.log(
    `${'source words'.padEnd(14)}${'domain'.padStart(10)}${'n'.padStart(5)}${'faith'.padStart(8)}${'invent'.padStart(8)}${'len'.padStart(7)}${'echo'.padStart(7)}${'reward'.padStart(8)}${'empty'.padStart(7)}`,
  );
  for (let b = 0; b < BINS.length - 1; b += 1) {
    const label = b === BINS.length - 2 ? `${BINS[b]}+` : `${BINS[b]}-${BINS[b + 1]}`;
    for (const domainName of ['prose', 'technical'] as const) {
      const group = scored.filter((s) => s.bin === label && (s.value === null || s.value.domain === domainName));
      const live = group.filter((s) => s.value !== null).map((s) => s.value as RewardTerms);
      if (live.length === 0) continue;
      const of = (pick: (v: RewardTerms) => number) => mean(live.map(pick));
      console.log(
        label.padEnd(14) +
          domainName.padStart(10) +
          String(group.length).padStart(5) +
          of((v) => v.anchorKeptRate).toFixed(3).padStart(8) +
          of((v) => v.inventedAnchors).toFixed(2).padStart(8) +
          of((v) => v.lengthRatio).toFixed(2).padStart(7) +
          of((v) => v.echoRate).toFixed(2).padStart(7) +
          of((v) => v.reward).toFixed(3).padStart(8) +
          String(group.filter((s) => s.empty).length).padStart(7),
      );
    }
  }
}
console.log('\nfaith falling as source words rise = a context problem: the student cannot hold the document.');
console.log('faith flat but technical far below prose = a knowledge problem: it does not know what to say.');
