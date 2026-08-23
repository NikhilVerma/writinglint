// Which habits does the training pool never show the model?
//
//   npx tsx src/cli/habit-mix.ts
//
// Matching the overall findings-per-1k of the benchmark is not enough. The GEC
// literature's result on synthetic data is that what matters is the error TYPE
// distribution, not the error rate: a corpus corrupted with the wrong mix
// teaches the wrong repairs however dirty it is. So this prints the share of
// weighted findings each rule family contributes, benchmark against pool, and
// sorts by the gap. The families at the top are the ones to manufacture.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { isScoredRule, weighFindings, weightFor } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';

const { values } = parseArgs({
  options: {
    train: { type: 'string', default: 'train/data/v14/train.jsonl' },
    bench: { type: 'string', default: 'drift-inputs-v11' },
    domain: { type: 'string', default: 'prose' },
    chunk: { type: 'string', default: '40' },
    // The reward scores ai-style plus one reader-first rule. Everything else in
    // reader-first is invisible to every number this project reports, so it
    // needs a way to be looked at directly.
    allRules: { type: 'boolean', default: false },
  },
});

const config = loadConfig();

/** Weighted findings per 1k words, per rule family, over the documents that
 * need work. Per 1k rather than a raw count so a long corpus and a short one
 * are comparable, and weighted so an error and an info finding are not
 * counted as the same thing. */
async function mix(sources: string[]): Promise<{ per1k: Map<string, number>; docs: number; total: number }> {
  const per1k = new Map<string, number>();
  let docs = 0;
  let total = 0;
  const chunk = Number(values.chunk);
  for (let i = 0; i < sources.length; i += chunk) {
    const batch = sources.slice(i, i + chunk);
    const texts = new Map<string, string>();
    batch.forEach((s, j) => texts.set(`s-${i + j}`, s));
    const found = await lintTexts(texts, config);
    batch.forEach((s, j) => {
      const raw = found.get(`s-${i + j}`) ?? [];
      const w = weighFindings(raw, config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules);
      const t = scoreRewrite({ source: s, output: s, sourceFindings: w, outputFindings: w, config: config.reward });
      if (t.domain !== values.domain) return;
      if (t.sourceFindingsPer1kWords <= config.reward.domains[t.domain].band[1]) return;
      docs += 1;
      const words = Math.max(1, s.split(/\s+/).filter(Boolean).length);
      for (const f of raw as { level: string; ruleId?: string }[]) {
        if (!values.allRules && !isScoredRule(f.ruleId, config.reward.scoredRules, config.reward.unscoredRules)) continue;
        // The family, not the individual rule: "one habit" is what a writing
        // instruction can name, and rule ids never reach the model anyway.
        const family = String(f.ruleId ?? 'unknown');
        const add = (weightFor(f.level, config.reward.levelWeights) * 1000) / words;
        per1k.set(family, (per1k.get(family) ?? 0) + add);
        total += add;
      }
    });
  }
  for (const [k, v] of per1k) per1k.set(k, v / Math.max(1, docs));
  return { per1k, docs, total };
}

const train = readFileSync(values.train as string, 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => (JSON.parse(l).messages as { content: string }[])[1].content.split('Simplify this:\n\n')[1] ?? '');

const seen = new Set<string>();
const bench: string[] = [];
for (const line of readFileSync(path.join(runsDir, `${values.bench as string}.jsonl`), 'utf8').split('\n')) {
  if (line.trim() === '') continue;
  const row = JSON.parse(line) as { id: string; input: string };
  if (seen.has(row.id)) continue;
  seen.add(row.id);
  bench.push(row.input);
}

const b = await mix(bench);
const t = await mix(train);
const families = [...new Set([...b.per1k.keys(), ...t.per1k.keys()])];
families.sort((x, y) => (b.per1k.get(y) ?? 0) - (t.per1k.get(y) ?? 0) - ((b.per1k.get(x) ?? 0) - (t.per1k.get(x) ?? 0)));

console.log(`\n${values.domain} documents that need work: benchmark ${b.docs}, training ${t.docs}`);
console.log(`\n  ${'family'.padEnd(28)} ${'benchmark'.padStart(10)} ${'training'.padStart(10)} ${'gap'.padStart(8)}`);
for (const f of families) {
  const bv = b.per1k.get(f) ?? 0;
  const tv = t.per1k.get(f) ?? 0;
  if (Math.abs(bv - tv) < 0.3 && bv < 1.0) continue;
  console.log(`  ${f.padEnd(28)} ${bv.toFixed(2).padStart(10)} ${tv.toFixed(2).padStart(10)} ${(bv - tv >= 0 ? '+' : '') + (bv - tv).toFixed(2)}`.padEnd(60));
}
console.log(`\nweighted findings/1k, averaged per document. Positive gap = the benchmark has it and the training set does not.`);
