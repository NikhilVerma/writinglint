// The other half of the eval. drift-report answers "does it leave finished
// text alone". This answers "does it clean dirty text at all".
//
//   npx tsx src/cli/clean-report.ts --arm base --arm v7 --arm v9
//
// It existed nowhere before, and that gap hid a goal-level failure for a whole
// model generation. sft-v9 was declared a success on drift alone: it churns
// only 0.6% of its own output at the median, which is the fixed point working.
// Scored on cleaning it moves a document 2.3 weighted findings per 1k and
// leaves nearly a third of them DIRTIER than it found them. Measuring only the
// half you optimised is how you ship a model that politely rephrases slop.
//
// Everything is reported per domain, because the bands differ and an average
// across both describes no document that exists.

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
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const pct = (n: number, of: number) => `${((100 * n) / Math.max(1, of)).toFixed(0)}%`;

function stderr(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length);
}

/** Documents are the unit, not rows: the benchmark draws each document about
 * 2.5 times and two draws of one essay are not two measurements of the model. */
function perDocument<T>(rows: { id: string; value: T }[], pick: (v: T) => number): number[] {
  const byId = new Map<string, number[]>();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, []);
    (byId.get(row.id) as number[]).push(pick(row.value));
  }
  return [...byId.values()].map(mean);
}

for (const arm of values.arm as string[]) {
  const file = path.join(runsDir, `drift-${arm}.jsonl`);
  const rows = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as { id: string; passes: string[] })
    .map((r) => ({ id: r.id, input: r.passes[0], output: normalizeOutput(r.passes[1] ?? '') }))
    .filter((r) => r.input.trim() !== '' && r.output.trim() !== '');

  const scored: { id: string; value: RewardTerms }[] = [];
  const chunkSize = Number(values.chunk);
  for (let start = 0; start < rows.length; start += chunkSize) {
    const batch = rows.slice(start, start + chunkSize);
    const texts = new Map<string, string>();
    batch.forEach((r, i) => {
      texts.set(`i-${start + i}`, r.input);
      texts.set(`o-${start + i}`, r.output);
    });
    const findings = await lintTexts(texts, config);
    const weigh = (key: string) =>
      weighFindings(findings.get(key) ?? [], config.reward.levelWeights, config.reward.scoredRules);
    batch.forEach((r, i) => {
      scored.push({
        id: r.id,
        value: scoreRewrite({
          source: r.input,
          output: r.output,
          sourceFindings: weigh(`i-${start + i}`),
          outputFindings: weigh(`o-${start + i}`),
          config: config.reward,
        }),
      });
    });
  }

  console.log(`\n${arm}  (${scored.length} rows over ${new Set(scored.map((s) => s.id)).size} documents)`);
  for (const domainName of ['prose', 'technical'] as const) {
    for (const needsWork of [true, false]) {
      report(arm, domainName, needsWork, scored);
    }
  }
}

/** One line-block, for one domain, split by whether the SOURCE needed work.
 *
 * Averaging across that split describes no document that exists, and it hid the
 * reward's worst defect. Roughly half the benchmark's sources already sit in
 * band, where handing them back untouched IS the right answer and scores 1.0.
 * Mixed into one mean, those documents lifted a verbatim-copy arm to 0.533 —
 * above every trained model — and made it look as though the reward paid for
 * doing nothing everywhere. It does not. The number that decides whether a
 * stage-2 run learns to copy is the dirty-source half, and only that half. */
function report(arm: string, domainName: 'prose' | 'technical', needsWork: boolean, all: { id: string; value: RewardTerms }[]) {
    const [bandLow, bandHigh] = config.reward.domains[domainName].band;
    const group = all.filter(
      (s) => s.value.domain === domainName && (s.value.sourceFindingsPer1kWords > bandHigh) === needsWork,
    );
    if (group.length === 0) return;
    const label = `${domainName} ${needsWork ? 'dirty' : 'clean'}`;
    const src = perDocument(group, (v) => v.sourceFindingsPer1kWords);
    const out = perDocument(group, (v) => v.findingsPer1kWords);
    const cut = perDocument(group, (v) => v.sourceFindingsPer1kWords - v.findingsPer1kWords);
    const inBand = group.filter((s) => s.value.findingsPer1kWords >= bandLow && s.value.findingsPer1kWords <= bandHigh);
    const dirtier = group.filter((s) => s.value.findingsPer1kWords > s.value.sourceFindingsPer1kWords);
    const worseThanBand = group.filter((s) => s.value.findingsPer1kWords > bandHigh);
    console.log(
      `  ${label.padEnd(18)} n=${group.length} docs=${src.length}  band [${bandLow}, ${bandHigh}]\n` +
        `    findings/1k   ${mean(src).toFixed(1)} -> ${mean(out).toFixed(1)}   cut ${mean(cut).toFixed(1)} +/-${(1.96 * stderr(cut)).toFixed(1)} (median ${median(cut).toFixed(1)})\n` +
        `    landed in band ${pct(inBand.length, group.length)}   still above band ${pct(worseThanBand.length, group.length)}   CAME OUT DIRTIER ${pct(dirtier.length, group.length)}\n` +
        `    faithfulness ${mean(perDocument(group, (v) => v.anchorKeptRate)).toFixed(3)}   invented ${mean(perDocument(group, (v) => v.inventedAnchors)).toFixed(2)}   length ${mean(perDocument(group, (v) => v.lengthRatio)).toFixed(3)}   echo ${mean(perDocument(group, (v) => v.echoRate)).toFixed(3)}\n` +
        `    reward ${mean(perDocument(group, (v) => v.reward)).toFixed(3)} +/-${(1.96 * stderr(perDocument(group, (v) => v.reward))).toFixed(3)}   degenerate ${group.filter((s) => s.value.degenerate).length}`,
    );
}
console.log('\ncut = weighted findings per 1k removed. A model that cannot clean is not worth shipping,');
console.log('however stable it is. "Came out dirtier" is the number that should be near zero.');
