// Which rules actually tell slop from the human writing it was made from?
//
//   npx tsx src/cli/rule-discrimination.ts --n 400
//
// The reward pays for the whole ai-style pack but only two reader-first rules,
// and that split was never a measurement. Three rules were tested once —
// sentence-load, aside-pileup, passive-actor-hiding — and the rest of
// reader-first is unpaid because nobody put it on the list. Six rules in the
// pack fire on the benchmark and earn nothing: abstract-reference-chain,
// unexplained-initialism, fragment-chain, label-led-explanation, noun-pile,
// paragraph-load.
//
// The test is the one that demoted passive-actor-hiding. Each document in the
// human-pairs corpus is a real piece of writing and a spoiled version of that
// same writing, so a rule that catches a writing habit should fire harder on
// the spoiled one. A rule that fires harder on the human original is not
// measuring slop, and paying to remove it teaches the model to write less like
// a person, whatever its name promises.
//
// Paired per document, unweighted counts per 1k words, every rule in every
// enabled pack whether or not the reward currently prices it.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { lintTexts } from '../lib/lint-batch.ts';

const { values } = parseArgs({
  options: {
    pairs: { type: 'string', default: 'runs/human-pairs-export/train.jsonl' },
    n: { type: 'string', default: '400' },
    chunk: { type: 'string', default: '30' },
    'min-fires': { type: 'string', default: '20' },
  },
});

const config = loadConfig();
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

const seen = new Set<string>();
const pairs: { slop: string; human: string }[] = [];
for (const line of readFileSync(values.pairs as string, 'utf8').split('\n')) {
  if (line.trim() === '' || pairs.length >= Number(values.n)) continue;
  const row = JSON.parse(line) as { messages: { content: string }[]; sourceId: string };
  if (seen.has(row.sourceId)) continue;
  seen.add(row.sourceId);
  const slop = row.messages[1].content.replace(/^Simplify this:\n\n/, '');
  const human = row.messages[2].content;
  if (words(slop) < 100 || words(human) < 100) continue;
  pairs.push({ slop, human });
}

/** Per-document, per-rule differences: slop minus human, counts per 1k words. */
const diffs = new Map<string, number[]>();
const slopRate = new Map<string, number[]>();
const humanRate = new Map<string, number[]>();

for (let i = 0; i < pairs.length; i += Number(values.chunk)) {
  const batch = pairs.slice(i, i + Number(values.chunk));
  const texts = new Map<string, string>();
  batch.forEach((p, j) => {
    texts.set(`s-${i + j}`, p.slop);
    texts.set(`h-${i + j}`, p.human);
  });
  const f = await lintTexts(texts, config);
  const tally = (key: string, n: number) => {
    const c = new Map<string, number>();
    for (const finding of (f.get(key) ?? []) as { ruleId?: string }[]) {
      if (finding.ruleId === undefined) continue;
      c.set(finding.ruleId, (c.get(finding.ruleId) ?? 0) + 1000 / n);
    }
    return c;
  };
  batch.forEach((p, j) => {
    const sw = words(p.slop);
    const hw = words(p.human);
    if (sw === 0 || hw === 0) return;
    const s = tally(`s-${i + j}`, sw);
    const h = tally(`h-${i + j}`, hw);
    for (const rule of new Set([...s.keys(), ...h.keys()])) {
      const sv = s.get(rule) ?? 0;
      const hv = h.get(rule) ?? 0;
      (diffs.get(rule) ?? diffs.set(rule, []).get(rule)!).push(sv - hv);
      (slopRate.get(rule) ?? slopRate.set(rule, []).get(rule)!).push(sv);
      (humanRate.get(rule) ?? humanRate.set(rule, []).get(rule)!).push(hv);
    }
  });
  console.log(`[discrim] ${Math.min(i + Number(values.chunk), pairs.length)}/${pairs.length}`);
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const ci = (x: number[]) => {
  const m = mean(x);
  const s = Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, x.length - 1));
  return (1.96 * s) / Math.sqrt(Math.max(1, x.length));
};

const paid = (rule: string) =>
  !config.reward.unscoredRules.includes(rule) &&
  (config.reward.scoredRules.length === 0 ||
    config.reward.scoredRules.includes(rule) ||
    config.reward.scoredRules.includes(rule.split('/')[0]));

const table = [...diffs.entries()]
  .filter(([, d]) => d.filter((x) => x !== 0).length >= Number(values['min-fires']))
  .map(([rule, d]) => ({ rule, m: mean(d), c: ci(d), n: d.length, slop: mean(slopRate.get(rule) ?? []), human: mean(humanRate.get(rule) ?? []), paid: paid(rule) }))
  .sort((a, b) => b.m - a.m);

console.log(`\n${pairs.length} documents, each a real piece of writing and a spoiled copy of it`);
console.log(`positive means the rule fires HARDER on the slop, which is what a slop rule should do\n`);
console.log(`${'rule'.padEnd(40)}${'slop'.padStart(7)}${'human'.padStart(7)}${'diff'.padStart(8)}${'+/-'.padStart(7)}  ${'paid'.padEnd(5)}verdict`);
for (const r of table) {
  const verdict = Math.abs(r.m) <= r.c ? 'cannot tell' : r.m > 0 ? 'discriminates' : 'BACKWARDS';
  console.log(
    r.rule.padEnd(40) + r.slop.toFixed(1).padStart(7) + r.human.toFixed(1).padStart(7) +
      `${r.m >= 0 ? '+' : ''}${r.m.toFixed(2)}`.padStart(8) + r.c.toFixed(2).padStart(7) +
      `  ${(r.paid ? 'yes' : 'no').padEnd(5)}${verdict}`,
  );
}

const mispriced = table.filter((r) => (r.m > r.c && !r.paid) || (r.m < -r.c && r.paid));
if (mispriced.length > 0) {
  console.log(`\nmispriced against this evidence:`);
  for (const r of mispriced) {
    console.log(`  ${r.rule} ${r.paid ? 'is paid and fires harder on the human original' : 'discriminates and earns nothing'}`);
  }
}
