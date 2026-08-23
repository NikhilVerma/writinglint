// Which rules can tell machine writing from the human original it was made from?
//
//   npx tsx src/cli/rule-discrimination.ts --limit 600
//
// The reward currently pays for the whole ai-style pack and exactly one
// reader-first rule. That was set from a pack-level average - reader-first
// scored -0.32 +/-0.72 findings per 1k against the humans, so it was demoted
// whole. A pack average is the wrong unit. A pack can contain one rule that
// discriminates strongly and another that fires on good writing, and averaging
// them throws away the first to punish the second.
//
// Every pair here is a human document and a machine-sloppified version of that
// same document, so the difference for a rule IS its discrimination. A rule
// that fires equally on both sides cannot be paid for: the model would be
// rewarded for removing something humans do too, which is how a rewriter learns
// to chop every sentence in half.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { loadConfig } from '../lib/env.ts';
import { weightFor } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';

const { values } = parseArgs({
  options: {
    in: { type: 'string', default: 'runs/human-pairs-export/train.jsonl' },
    limit: { type: 'string', default: '600' },
    chunk: { type: 'string', default: '20' },
  },
});

const config = loadConfig();
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
function stderr(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length);
}

const limit = Number(values.limit);
const seen = new Set<string>();
const pairs: { slop: string; human: string }[] = [];
for (const line of readFileSync(values.in as string, 'utf8').split('\n')) {
  if (line.trim() === '') continue;
  const row = JSON.parse(line) as { messages: { content: string }[]; sourceId: string };
  // Several models sloppified each essay; one pair per source document keeps a
  // heavily-resampled essay from dominating the average.
  if (seen.has(row.sourceId)) continue;
  seen.add(row.sourceId);
  pairs.push({ slop: row.messages[1].content.replace(/^Simplify this:\n\n/, ''), human: row.messages[2].content });
  if (limit > 0 && pairs.length >= limit) break;
}

/** Per-rule weighted findings per 1k, one value per document. */
const slopBy = new Map<string, number[]>();
const humanBy = new Map<string, number[]>();
const chunk = Number(values.chunk);
for (let i = 0; i < pairs.length; i += chunk) {
  const batch = pairs.slice(i, i + chunk);
  const texts = new Map<string, string>();
  batch.forEach((p, j) => {
    texts.set(`m-${i + j}`, p.slop);
    texts.set(`h-${i + j}`, p.human);
  });
  const found = await lintTexts(texts, config);
  const tally = (key: string, text: string, into: Map<string, number[]>, slot: number) => {
    const words = Math.max(1, text.split(/\s+/).filter(Boolean).length);
    const here = new Map<string, number>();
    for (const f of (found.get(key) ?? []) as { level: string; ruleId?: string }[]) {
      const id = String(f.ruleId ?? 'unknown');
      here.set(id, (here.get(id) ?? 0) + (weightFor(f.level, config.reward.levelWeights) * 1000) / words);
    }
    for (const [id, v] of here) {
      if (!into.has(id)) into.set(id, []);
      const arr = into.get(id) as number[];
      while (arr.length < slot) arr.push(0);
      arr.push(v);
    }
  };
  batch.forEach((p, j) => {
    tally(`m-${i + j}`, p.slop, slopBy, i + j);
    tally(`h-${i + j}`, p.human, humanBy, i + j);
  });
  console.log(`[disc] ${Math.min(i + chunk, pairs.length)}/${pairs.length}`);
}

const pad = (m: Map<string, number[]>) => {
  for (const arr of m.values()) while (arr.length < pairs.length) arr.push(0);
};
pad(slopBy);
pad(humanBy);

const ids = [...new Set([...slopBy.keys(), ...humanBy.keys()])];
const rows = ids.map((id) => {
  const s = slopBy.get(id) ?? new Array(pairs.length).fill(0);
  const h = humanBy.get(id) ?? new Array(pairs.length).fill(0);
  const diff = s.map((v, i) => v - h[i]);
  return { id, slop: mean(s), human: mean(h), gap: mean(diff), ci: 1.96 * stderr(diff) };
});
rows.sort((a, b) => b.gap - a.gap);

console.log(`\n${pairs.length} paired documents: a human essay and a machine-sloppified version of it\n`);
console.log(`  ${'rule'.padEnd(38)} ${'slop'.padStart(7)} ${'human'.padStart(7)} ${'gap'.padStart(8)} ${'95% ci'.padStart(8)}  discriminates`);
for (const r of rows) {
  if (r.slop < 0.15 && r.human < 0.15) continue;
  const real = r.gap - r.ci > 0;
  const scored =
    !(config.reward.unscoredRules ?? []).includes(r.id) &&
    config.reward.scoredRules.some((s) => r.id === s || r.id.split('/')[0] === s);
  console.log(
    `  ${r.id.padEnd(38)} ${r.slop.toFixed(2).padStart(7)} ${r.human.toFixed(2).padStart(7)} ` +
      `${((r.gap >= 0 ? '+' : '') + r.gap.toFixed(2)).padStart(8)} ${`+/-${r.ci.toFixed(2)}`.padStart(8)}  ` +
      `${real ? 'YES' : 'no '}${scored ? '  [paid]' : ''}`,
  );
}
console.log(`\ngap = how much harder the rule fires on the machine version of the SAME document.`);
console.log(`"discriminates" means the gap clears its own error bar. A rule that does not should not be paid for.`);
