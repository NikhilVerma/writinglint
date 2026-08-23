// How much of the source SURVIVES a rewrite, sentence by sentence.
//
//   npx tsx src/cli/content-loss.ts --dir <v16 batch root>
//
// Faithfulness counts anchors: numbers, symbols, identifiers. A rewrite can
// delete a third of a blog post, keep every number in it, and score 0.99. That
// is exactly what the base model's best-of-8 does — 0.993 faithful at 0.66
// length ratio — and it is why a careful editor loses to it by 15 findings per
// 1k. Nothing in the reward measures the thing being lost.
//
// So measure it directly: for each sentence of the source, is there any
// sentence in the output that carries its content words? A source sentence with
// no match anywhere in the output was dropped, not rewritten. That is a number
// the reward could price and currently does not.
//
// DO NOT TRUST THIS TOOL'S HEADLINE NUMBER. It was written to test the theory
// that best-of-8 wins by deleting, it reported 53.4% of source sentences
// dropped against a teacher's 9.2%, and reading the worst-scoring document
// showed the theory was wrong. That document is a 738-word corrupted essay
// rewritten to 381 words, scored at 95% dropped, and nothing in it is dropped:
//
//   source  "It is important to note that were we to encounter intelligent
//            life elsewhere in the cosmos, there are certain facts we would
//            inevitably have in common."
//   output  "If we encountered intelligent life elsewhere in the universe, we
//            would share some basic facts."
//
// Content-word overlap cannot separate "deleted" from "reworded", and the bias
// does NOT cancel between two rewrites the way the first version of this
// comment claimed. It systematically favours whichever rewrite stays closer to
// the source wording, which is the teacher by construction. A rewrite that
// merges three verbose sentences into one good one is scored as losing two.
//
// Kept because the negative result is worth keeping, and because the tool is
// still the right shape: something has to measure what a rewrite discards, and
// the reward prices nothing of the sort. It needs an entailment model, not word
// overlap. Until then its output is not evidence.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';
import { normalizeOutput } from '../lib/text.ts';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    samples: { type: 'string', default: 'v15-samples' },
    prompts: { type: 'string', default: 'v15-prompts' },
    /** Content-word overlap above which a source sentence counts as surviving. */
    match: { type: 'string', default: '0.5' },
    'min-faith': { type: 'string', default: '0.9' },
    'max-echo': { type: 'string', default: '0.9' },
    'max-copy': { type: 'string', default: '0.95' },
    chunk: { type: 'string', default: '30' },
    // Print the document where best-of-8 drops the most, so a 53% figure can be
    // read against the actual text rather than trusted as a statistic.
    show: { type: 'boolean', default: false },
  },
});
if (values.dir === undefined) throw new Error('usage: content-loss --dir <batch root>');

const config = loadConfig();
const matchAt = Number(values.match);

// Function words carry no content, and leaving them in lets two unrelated
// sentences match on "the of a to is".
const STOP = new Set(
  ('a an the and or but if then than that this these those of to in on at by for with from as is are was were be been being it its ' +
    'we you they he she i our your their his her not no do does did have has had will would can could should may might must about ' +
    'into over under out up down so such more most very just also there here what which who whom when where how why all any some')
    .split(' '),
);
const content = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
const sentences = (t: string) =>
  t
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 5);

/** Share of source sentences with no content match anywhere in the output. */
function dropRate(source: string, output: string): number {
  const src = sentences(source);
  if (src.length === 0) return 0;
  const out = sentences(output).map(content);
  let dropped = 0;
  for (const s of src) {
    const cs = content(s);
    if (cs.size === 0) continue;
    let best = 0;
    for (const co of out) {
      let shared = 0;
      for (const w of cs) if (co.has(w)) shared += 1;
      const r = shared / cs.size;
      if (r > best) best = r;
    }
    if (best < matchAt) dropped += 1;
  }
  return dropped / src.length;
}

const jsonl = (name: string) =>
  readFileSync(path.join(runsDir, `${name}.jsonl`), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
const promptRows = jsonl(values.prompts as string) as { id: string; source: string }[];
const sampleRows = jsonl(values.samples as string) as { source: string; outputs: string[] }[];
const samples = new Map<string, { source: string; outputs: string[] }>();
promptRows.forEach((p, i) => samples.set(p.id, { source: p.source, outputs: sampleRows[i].outputs }));

const root = path.resolve(values.dir);
const batches = readdirSync(root).filter((d) => d.startsWith('batch-')).map((d) => path.join(root, d));
const dirs = batches.length > 0 ? batches : [root];

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const items: { id: string; source: string; teacher: string; outputs: string[] }[] = [];
for (const dir of dirs) {
  const index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8')) as { file: string; id: string }[];
  for (const entry of index) {
    const out = path.join(dir, entry.file.replace(/\.md$/, '.out.md'));
    const s = samples.get(entry.id);
    if (!existsSync(out) || s === undefined) continue;
    const teacher = readFileSync(out, 'utf8').trim();
    const sw = new Set(teacher.split(/\s+/));
    const overlap = s.source.split(/\s+/).filter((w) => sw.has(w)).length / Math.max(1, words(s.source));
    if (overlap > Number(values['max-copy'])) continue;
    items.push({ id: entry.id, source: s.source, teacher, outputs: s.outputs });
  }
}

const rows: { tDrop: number; bDrop: number; tLen: number; bLen: number }[] = [];
let worst: { id: string; source: string; best: string; drop: number } | null = null;
for (let start = 0; start < items.length; start += Number(values.chunk)) {
  const batch = items.slice(start, start + Number(values.chunk));
  const texts = new Map<string, string>();
  batch.forEach((it, i) => {
    texts.set(`s-${i}`, it.source);
    it.outputs.forEach((o, j) => {
      const clean = normalizeOutput(o);
      if (clean.trim() !== '') texts.set(`o-${i}-${j}`, clean);
    });
  });
  const f = await lintTexts(texts, config);
  const weigh = (k: string) =>
    weighFindings(f.get(k) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules);

  batch.forEach((it, i) => {
    const sw = words(it.source);
    const s1k = (weigh(`s-${i}`) * 1000) / sw;
    let best: { text: string; cut: number } | null = null;
    it.outputs.forEach((o, j) => {
      const clean = normalizeOutput(o);
      if (!texts.has(`o-${i}-${j}`)) return;
      const terms = scoreRewrite({
        source: it.source,
        output: clean,
        sourceFindings: weigh(`s-${i}`),
        outputFindings: weigh(`o-${i}-${j}`),
        config: config.reward,
      });
      if (terms.degenerate || terms.anchorKeptRate < Number(values['min-faith']) || terms.echoRate > Number(values['max-echo'])) return;
      const cut = s1k - (weigh(`o-${i}-${j}`) * 1000) / words(clean);
      if (best === null || cut > best.cut) best = { text: clean, cut };
    });
    if (best === null) return;
    const bDropHere = dropRate(it.source, best.text);
    if (worst === null || bDropHere > worst.drop) worst = { id: it.id, source: it.source, best: best.text, drop: bDropHere };
    rows.push({
      tDrop: dropRate(it.source, it.teacher),
      bDrop: bDropHere,
      tLen: words(it.teacher) / sw,
      bLen: words(best.text) / sw,
    });
  });
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const ci = (x: number[]) => {
  const m = mean(x);
  const sd = Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, x.length - 1));
  return (1.96 * sd) / Math.sqrt(Math.max(1, x.length));
};

console.log(`\n${'rewrite'.padEnd(12)}${'n'.padStart(5)}${'sentences dropped'.padStart(20)}${'length'.padStart(9)}`);
console.log('teacher'.padEnd(12) + String(rows.length).padStart(5) + `${(100 * mean(rows.map((r) => r.tDrop))).toFixed(1)}%`.padStart(20) +
  mean(rows.map((r) => r.tLen)).toFixed(3).padStart(9));
console.log('best-of-8'.padEnd(12) + String(rows.length).padStart(5) + `${(100 * mean(rows.map((r) => r.bDrop))).toFixed(1)}%`.padStart(20) +
  mean(rows.map((r) => r.bLen)).toFixed(3).padStart(9));

const d = rows.map((r) => r.bDrop - r.tDrop);
const m = mean(d);
console.log(
  `\npaired best-of-8 minus teacher: ${m >= 0 ? '+' : ''}${(100 * m).toFixed(1)} points +/-${(100 * ci(d)).toFixed(1)} ` +
    `over ${d.length} documents (best-of-8 drops more on ${((100 * d.filter((x) => x > 0).length) / Math.max(1, d.length)).toFixed(0)}%)`,
);
console.log('\nA source sentence with no content match anywhere in the output was dropped, not rewritten.');
if (values.show === true && worst !== null) {
  console.log(`\n=== worst document: ${worst.id} (${(100 * worst.drop).toFixed(0)}% of sentences dropped) ===`);
  console.log(`\n--- SOURCE (${words(worst.source)} words) ---\n${worst.source.slice(0, 1600)}`);
  console.log(`\n--- BEST OF 8 (${words(worst.best)} words) ---\n${worst.best.slice(0, 1600)}`);
}
