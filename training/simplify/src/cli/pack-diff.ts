// Paired per-rulepack comparison of two eval arms.
//
//   npx tsx src/cli/pack-diff.ts --a sft8bv16 --b qwen8 --slice prose-dirty
//
// The goal names two rulepacks and asks that both be catered for. `arm-diff`
// answers "is A better than B" in the units the reward prices, which folds all
// of ai-style and exactly two reader-first rules into one number. A model can
// win that number while leaving reader-first untouched, or while making it
// worse, and nothing in the summary would say so.
//
// So this splits the same paired difference by pack and by rule, and it counts
// every rule in both packs — including the ones the reward does not pay for.
// A rule outside `scoredRules` is not outside the goal; it is a habit the
// product reports to users and the reward happens to be silent about. Whether
// training on a narrow reward moves the wider pack is exactly the question, and
// it cannot be asked in reward units.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { extractAnchors } from '../lib/faithfulness.ts';
import { lintTexts } from '../lib/lint-batch.ts';

const { values } = parseArgs({
  options: {
    a: { type: 'string', default: 'sft8bv16' },
    b: { type: 'string', default: 'qwen8' },
    slice: { type: 'string', default: 'prose-dirty' },
    chunk: { type: 'string', default: '40' },
    /** Also break each pack down to its individual rules. */
    rules: { type: 'boolean', default: false },
  },
});

const config = loadConfig();
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

interface Row { id: string; passes: string[] }
const read = (name: string) =>
  readFileSync(path.join(runsDir, `drift-${name}.jsonl`), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Row);

const A = new Map(read(values.a as string).map((r) => [r.id, r]));
const B = new Map(read(values.b as string).map((r) => [r.id, r]));
const ids = [...A.keys()].filter((id) => B.has(id));

type Counts = Map<string, number>;
interface Scored { id: string; per1k: Counts; source1k: Counts; technical: boolean; sourcePer1k: number }

// Unweighted counts per rule. The reward's level weights exist to price a
// habit against another habit inside one number; splitting by rule is asking
// how often each fires, and a weight would blur that back together.
async function score(map: Map<string, Row>): Promise<Map<string, Scored>> {
  const out = new Map<string, Scored>();
  for (let i = 0; i < ids.length; i += Number(values.chunk)) {
    const batch = ids.slice(i, i + Number(values.chunk));
    const texts = new Map<string, string>();
    batch.forEach((id, j) => {
      const r = map.get(id) as Row;
      texts.set(`s-${i + j}`, r.passes[0]);
      texts.set(`o-${i + j}`, r.passes[1]);
    });
    const f = await lintTexts(texts, config);
    batch.forEach((id, j) => {
      const r = map.get(id) as Row;
      const sw = words(r.passes[0]);
      const ow = words(r.passes[1]);
      if (sw === 0 || ow === 0) return;
      const tally = (key: string, n: number) => {
        const c: Counts = new Map();
        for (const finding of (f.get(key) ?? []) as { ruleId?: string }[]) {
          if (finding.ruleId === undefined) continue;
          c.set(finding.ruleId, (c.get(finding.ruleId) ?? 0) + 1000 / n);
        }
        return c;
      };
      const source = tally(`s-${i + j}`, sw);
      let total = 0;
      for (const v of source.values()) total += v;
      const a = extractAnchors(r.passes[0]);
      out.set(id, {
        id,
        per1k: tally(`o-${i + j}`, ow),
        source1k: source,
        technical: (100 * (a.numbers.size + a.symbols.size)) / sw >= config.reward.technicalAnchorsPer100Words,
        sourcePer1k: total,
      });
    });
  }
  return out;
}

const sa = await score(A);
const sb = await score(B);

// Dirty means the source sits above the median of its own domain, taken over
// the documents actually in hand rather than a constant carried from an older
// corpus.
const domain = (s: Scored) => (s.technical ? 'technical' : 'prose');
const medians: Record<string, number> = {};
for (const d of ['prose', 'technical']) {
  const xs = [...sb.values()].filter((s) => domain(s) === d).map((s) => s.sourcePer1k).sort((x, y) => x - y);
  medians[d] = xs[Math.floor(xs.length / 2)] ?? 0;
}
const inSlice = (s: Scored) => {
  if (values.slice === 'all') return true;
  const [d, dirt] = (values.slice as string).split('-');
  if (domain(s) !== d) return false;
  return dirt === 'dirty' ? s.sourcePer1k >= medians[d] : s.sourcePer1k < medians[d];
};

const pairs = ids
  .map((id) => ({ a: sa.get(id), b: sb.get(id) }))
  .filter((p): p is { a: Scored; b: Scored } => p.a !== undefined && p.b !== undefined)
  // Slice on arm B, the baseline, so both arms are compared over one document
  // set even when a rewrite crosses the band edge.
  .filter((p) => inSlice(p.b));

const allRules = new Set<string>();
for (const p of pairs) for (const c of [p.a.per1k, p.b.per1k, p.a.source1k]) for (const k of c.keys()) allRules.add(k);

function paired(pick: (s: Scored) => number) {
  const d = pairs.map((p) => pick(p.b) - pick(p.a));
  const n = d.length;
  const mean = d.reduce((x, y) => x + y, 0) / Math.max(1, n);
  const sd = Math.sqrt(d.reduce((acc, x) => acc + (x - mean) ** 2, 0) / Math.max(1, n - 1));
  return { mean, ci: (1.96 * sd) / Math.sqrt(Math.max(1, n)), n };
}
const sumOf = (c: Counts, pred: (r: string) => boolean) => {
  let t = 0;
  for (const [k, v] of c) if (pred(k)) t += v;
  return t;
};

console.log(`\n${values.a} vs ${values.b}, slice ${values.slice}, ${pairs.length} documents`);
console.log('positive means arm A leaves FEWER findings than arm B\n');
console.log(`${'pack'.padEnd(30)}${'source/1k'.padStart(11)}${'A left'.padStart(9)}${'B left'.padStart(9)}${'diff'.padStart(9)}${'+/-'.padStart(8)}${'verdict'.padStart(9)}`);

const packs = ['ai-style', 'reader-first'];
for (const pack of packs) {
  const pred = (r: string) => r.startsWith(`${pack}/`);
  const r = paired((s) => sumOf(s.per1k, pred));
  const src = pairs.reduce((t, p) => t + sumOf(p.b.source1k, pred), 0) / Math.max(1, pairs.length);
  const aLeft = pairs.reduce((t, p) => t + sumOf(p.a.per1k, pred), 0) / Math.max(1, pairs.length);
  const bLeft = pairs.reduce((t, p) => t + sumOf(p.b.per1k, pred), 0) / Math.max(1, pairs.length);
  console.log(
    pack.padEnd(30) + src.toFixed(1).padStart(11) + aLeft.toFixed(1).padStart(9) + bLeft.toFixed(1).padStart(9) +
      `${r.mean >= 0 ? '+' : ''}${r.mean.toFixed(2)}`.padStart(9) + r.ci.toFixed(2).padStart(8) +
      (Math.abs(r.mean) > r.ci ? (r.mean > 0 ? 'BETTER' : 'WORSE') : 'SAME').padStart(9),
  );
}

if (values.rules === true) {
  console.log('');
  const rows = [...allRules].sort().map((rule) => {
    const pred = (r: string) => r === rule;
    const r = paired((s) => sumOf(s.per1k, pred));
    const src = pairs.reduce((t, p) => t + sumOf(p.b.source1k, pred), 0) / Math.max(1, pairs.length);
    const paid = config.reward.scoredRules.length === 0 ||
      (!config.reward.unscoredRules.includes(rule) &&
        (config.reward.scoredRules.includes(rule) || config.reward.scoredRules.includes(rule.split('/')[0])));
    return { rule, r, src, paid };
  });
  rows.sort((x, y) => y.src - x.src);
  console.log(`${'rule'.padEnd(38)}${'source/1k'.padStart(11)}${'diff'.padStart(9)}${'+/-'.padStart(8)}${'paid'.padStart(6)}${'verdict'.padStart(9)}`);
  for (const { rule, r, src, paid } of rows) {
    if (src < 0.05) continue;
    console.log(
      rule.padEnd(38) + src.toFixed(2).padStart(11) + `${r.mean >= 0 ? '+' : ''}${r.mean.toFixed(2)}`.padStart(9) +
        r.ci.toFixed(2).padStart(8) + (paid ? 'yes' : 'no').padStart(6) +
        (Math.abs(r.mean) > r.ci ? (r.mean > 0 ? 'BETTER' : 'WORSE') : 'SAME').padStart(9),
    );
  }
  console.log('\n"paid" is whether the reward counts the rule. A rule it does not pay for is still in the product.');
}
