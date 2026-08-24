// A second benchmark, from documents nothing has ever trained or been graded on.
//
//   npx tsx src/cli/bench2-build.ts --out drift-inputs-bench2 --n 600
//
// The first benchmark holds 275 documents, which gives a paired interval of
// about +/-1.3 findings per 1k on a single rulepack. v16's ai-style difference
// is +1.20, so the instrument cannot resolve the effect it is being asked
// about — not because the effect is absent but because the benchmark is too
// small for it. This builds a bigger one.
//
// It is a replication, not an extension. The documents are kept separate from
// the first benchmark and reported on their own, because a fresh set answered
// after stating the prediction is stronger evidence than a merged set answered
// after seeing the result.
//
// Every candidate is checked against the training pool at the 8-gram level,
// not by exact text, because a document that differs only in whitespace is
// still a document the student has seen.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { extractAnchors } from '../lib/faithfulness.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';

const { values } = parseArgs({
  options: {
    pools: { type: 'string', default: 'docs-2018-corrupt,docs-2018,docs-clean,docs-corrupt,docs-holdout' },
    out: { type: 'string', default: 'drift-inputs-bench2' },
    n: { type: 'string', default: '600' },
    'min-words': { type: 'string', default: '150' },
    'max-words': { type: 'string', default: '900' },
    'max-overlap': { type: 'string', default: '0.3' },
    chunk: { type: 'string', default: '40' },
  },
});

const config = loadConfig();
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** 8-gram set, for near-duplicate detection against everything already used. */
function shingles(text: string, k = 8): Set<string> {
  const w = text.toLowerCase().split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + k <= w.length; i += 1) out.add(w.slice(i, i + k).join(' '));
  return out;
}

// Everything a student has seen or been graded on: the v15 prompt pool (which
// is the superset the training pairs were drawn from) and the first benchmark.
const usedIndex = new Map<string, Set<number>>();
let usedCount = 0;
const addUsed = (text: string) => {
  const id = usedCount;
  usedCount += 1;
  for (const s of shingles(text)) {
    const at = usedIndex.get(s) ?? new Set<number>();
    at.add(id);
    usedIndex.set(s, at);
  }
};
for (const line of readFileSync(path.join(runsDir, 'v15-prompts.jsonl'), 'utf8').split('\n')) {
  if (line.trim() === '') continue;
  addUsed((JSON.parse(line) as { source: string }).source);
}
for (const line of readFileSync(path.join(runsDir, 'drift-inputs-v11.jsonl'), 'utf8').split('\n')) {
  if (line.trim() === '') continue;
  addUsed((JSON.parse(line) as { input: string }).input);
}

const maxOverlap = Number(values['max-overlap']);
function seenBefore(text: string): boolean {
  const s = shingles(text);
  if (s.size === 0) return false;
  const hits = new Map<number, number>();
  for (const g of s) for (const id of usedIndex.get(g) ?? []) hits.set(id, (hits.get(id) ?? 0) + 1);
  for (const n of hits.values()) if (n / s.size > maxOverlap) return true;
  return false;
}

const minWords = Number(values['min-words']);
const maxWords = Number(values['max-words']);
const cands: { id: string; input: string }[] = [];
let tooShort = 0;
let tooLong = 0;
let overlapped = 0;
for (const pool of (values.pools as string).split(',')) {
  const dir = path.join(runsDir, pool.trim());
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(path.join(dir, file), 'utf8').trim();
    const n = words(text);
    if (n < minWords) { tooShort += 1; continue; }
    if (n > maxWords) { tooLong += 1; continue; }
    if (seenBefore(text)) { overlapped += 1; continue; }
    cands.push({ id: `${pool.trim()}/${file.replace(/\.md$/, '')}`, input: text });
    addUsed(text);
  }
}

// Classified the way the reward classifies, so the slice a document lands in
// is decided by the same rule the eval will apply, not by which folder it
// came from.
type Scored = { id: string; input: string; per1k: number; technical: boolean };
const scored: Scored[] = [];
for (let i = 0; i < cands.length; i += Number(values.chunk)) {
  const batch = cands.slice(i, i + Number(values.chunk));
  const texts = new Map<string, string>();
  batch.forEach((c, j) => texts.set(`s-${i + j}`, c.input));
  const f = await lintTexts(texts, config);
  batch.forEach((c, j) => {
    const n = words(c.input);
    const w = weighFindings(f.get(`s-${i + j}`) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules);
    const a = extractAnchors(c.input);
    scored.push({
      id: c.id,
      input: c.input,
      per1k: (w * 1000) / n,
      technical: (100 * (a.numbers.size + a.symbols.size)) / n >= config.reward.technicalAnchorsPer100Words,
    });
  });
  console.log(`[bench2] ${Math.min(i + Number(values.chunk), cands.length)}/${cands.length}`);
}

// Stratified so no slice is left too small to say anything about, which is the
// failure the first benchmark had: 31 technical-dirty documents gave +/-4.8.
const buckets = new Map<string, Scored[]>();
for (const d of ['prose', 'technical']) {
  const xs = scored.filter((s) => (s.technical ? 'technical' : 'prose') === d);
  const median = [...xs].sort((a, b) => a.per1k - b.per1k)[Math.floor(xs.length / 2)]?.per1k ?? 0;
  buckets.set(`${d}-dirty`, xs.filter((s) => s.per1k > median));
  buckets.set(`${d}-clean`, xs.filter((s) => s.per1k <= median));
}

const want = Math.floor(Number(values.n) / 4);
const picked: Scored[] = [];
for (const [name, xs] of buckets) {
  // Deterministic and spread across the range, so a slice is not all one
  // corpus or all one length.
  const step = Math.max(1, Math.floor(xs.length / want));
  const take = xs.filter((_x, i) => i % step === 0).slice(0, want);
  picked.push(...take);
  console.log(`${name.padEnd(18)}${String(xs.length).padStart(6)} available  ${String(take.length).padStart(4)} taken`);
}

const file = path.join(runsDir, `${values.out as string}.jsonl`);
writeFileSync(file, `${picked.map((s) => JSON.stringify({ id: s.id, input: s.input })).join('\n')}\n`);
console.log(
  `\nwrote ${picked.length} documents to ${file}\n` +
    `  ${cands.length} candidates from ${(values.pools as string).split(',').length} pools\n` +
    `  dropped ${overlapped} that overlap the training pool or the first benchmark, ${tooShort} too short, ${tooLong} too long`,
);
