// Is a teacher target better than the target best-of-8 already found, on the
// SAME training document?
//
//   npx tsx src/cli/teacher-vs-bon.ts --dir <v16 batch root> --samples v15-samples
//
// This is the gate v16 has to clear before any GPU time, and it is the right
// instrument where a benchmark ceiling was the wrong one. A ceiling asks what a
// stronger writer can do on documents the student will never train on. This
// asks what actually goes into the dataset: for every document, the teacher's
// rewrite against the best of eight samples the base model already produced for
// it. If the teacher only matches best-of-8, there is nothing to distil, and no
// amount of training on it can move the student off its own distribution.
//
// Paired, because a per-document difference is the only comparison that
// survives a corpus whose documents differ by 40 findings per 1k.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { faithfulness } from '../lib/faithfulness.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';
import { normalizeOutput } from '../lib/text.ts';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    samples: { type: 'string', default: 'v15-samples' },
    // The sample file carries no id — it is written line-for-line from the
    // prompt file, so the id lives there. Zipping is only safe if the sources
    // match, which is checked rather than assumed.
    prompts: { type: 'string', default: 'v15-prompts' },
    chunk: { type: 'string', default: '30' },
    // The same gates best-of-n applies BEFORE it selects. Picking the
    // highest-cutting sample without them compares the teacher against a
    // target the dataset would never have contained — the base model's best
    // raw cut averages 0.885 faithfulness, well under the gate it has to pass.
    'min-faith': { type: 'string', default: '0.9' },
    'max-echo': { type: 'string', default: '0.9' },
    // A rewrite that is a copy of its input is an agent that did not do the
    // job, not a teacher judging the document finished. Counted and dropped,
    // because leaving them in scores the collection process, not the teacher.
    'max-copy': { type: 'string', default: '0.95' },
    'per-doc': { type: 'boolean', default: false },
  },
});
if (values.dir === undefined) throw new Error('usage: teacher-vs-bon --dir <batch root> [--samples name]');

const config = loadConfig();
const minFaith = Number(values['min-faith']);
const maxEcho = Number(values['max-echo']);
const maxCopy = Number(values['max-copy']);
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

const jsonl = (name: string) =>
  readFileSync(path.join(runsDir, `${name}.jsonl`), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
const promptRows = jsonl(values.prompts as string) as { id: string; source: string }[];
const sampleRows = jsonl(values.samples as string) as { source: string; outputs: string[] }[];
if (promptRows.length !== sampleRows.length) {
  throw new Error(`${values.prompts} has ${promptRows.length} rows and ${values.samples} has ${sampleRows.length}; they cannot be zipped`);
}
const samples = new Map<string, { source: string; outputs: string[] }>();
promptRows.forEach((p, i) => {
  if (p.source.trim() !== sampleRows[i].source.trim()) throw new Error(`row ${i} sources differ between prompts and samples`);
  samples.set(p.id, { source: p.source, outputs: sampleRows[i].outputs });
});

const root = path.resolve(values.dir);
const batches = readdirSync(root).filter((d) => d.startsWith('batch-')).map((d) => path.join(root, d));
const dirs = batches.length > 0 ? batches : [root];

type Item = { id: string; source: string; teacher: string; outputs: string[] };
const items: Item[] = [];
let noSample = 0;
let copied = 0;

/** Word-level overlap, to catch a rewrite that is really a copy. */
function overlap(a: string, b: string): number {
  const wa = a.trim().split(/\s+/).filter(Boolean);
  const wb = new Set(b.trim().split(/\s+/).filter(Boolean));
  if (wa.length === 0) return 0;
  return wa.filter((w) => wb.has(w)).length / wa.length;
}
for (const dir of dirs) {
  const index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8')) as { file: string; id: string }[];
  for (const entry of index) {
    const out = path.join(dir, entry.file.replace(/\.md$/, '.out.md'));
    if (!existsSync(out)) continue;
    const s = samples.get(entry.id);
    if (s === undefined) {
      noSample += 1;
      continue;
    }
    const teacher = readFileSync(out, 'utf8').trim();
    if (overlap(s.source, teacher) > maxCopy) {
      copied += 1;
      continue;
    }
    items.push({ id: entry.id, source: s.source, teacher, outputs: s.outputs });
  }
}
if (items.length === 0) throw new Error('no teacher rewrites paired with a sampled document');

type Row = { id: string; teacherCut: number; bonCut: number; meanCut: number; teacherLen: number; bonLen: number; teacherFaith: number; bonFaith: number };
const rows: Row[] = [];

for (let start = 0; start < items.length; start += Number(values.chunk)) {
  const batch = items.slice(start, start + Number(values.chunk));
  const texts = new Map<string, string>();
  batch.forEach((it, i) => {
    texts.set(`s-${i}`, it.source);
    texts.set(`t-${i}`, it.teacher);
    it.outputs.forEach((o, j) => {
      const clean = normalizeOutput(o);
      if (clean.trim() !== '') texts.set(`o-${i}-${j}`, clean);
    });
  });
  const f = await lintTexts(texts, config);
  const per1k = (key: string, n: number) =>
    (weighFindings(f.get(key) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules) * 1000) / n;

  batch.forEach((it, i) => {
    const sw = words(it.source);
    const tw = words(it.teacher);
    if (sw === 0 || tw === 0) return;
    const s1k = per1k(`s-${i}`, sw);
    // Best of eight by findings REMOVED, the same rule best-of-n selects on.
    // Ranking by anything else would compare the teacher against a target the
    // dataset would never have contained.
    let best: { cut: number; len: number; faith: number } | null = null;
    // The mean over all eight samples is what the base model DOES; the best is
    // what rejection sampling hands the student. The distance between them is
    // the headroom self-distillation was supposed to capture, and it is the
    // number that says whether SFT on a model's own tail can work at all.
    const allCuts: number[] = [];
    it.outputs.forEach((o, j) => {
      const clean = normalizeOutput(o);
      const key = `o-${i}-${j}`;
      if (!texts.has(key)) return;
      const ow = words(clean);
      if (ow === 0) return;
      const terms = scoreRewrite({
        source: it.source,
        output: clean,
        sourceFindings: weighFindings(f.get(`s-${i}`) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules),
        outputFindings: weighFindings(f.get(key) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules),
        config: config.reward,
      });
      if (terms.degenerate || terms.anchorKeptRate < minFaith || terms.echoRate > maxEcho) return;
      const cut = s1k - per1k(key, ow);
      allCuts.push(cut);
      if (best === null || cut > best.cut) best = { cut, len: ow / sw, faith: terms.anchorKeptRate };
    });
    if (best === null) return;
    rows.push({
      id: it.id,
      teacherCut: s1k - per1k(`t-${i}`, tw),
      bonCut: best.cut,
      meanCut: allCuts.reduce((a, b) => a + b, 0) / allCuts.length,
      teacherLen: tw / sw,
      bonLen: best.len,
      teacherFaith: faithfulness(it.source, it.teacher).keptRate,
      bonFaith: best.faith,
    });
  });
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const ci = (x: number[]) => {
  const m = mean(x);
  const sd = Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, x.length - 1));
  return (1.96 * sd) / Math.sqrt(Math.max(1, x.length));
};

if (values['per-doc'] === true) {
  console.log(`\n${'diff'.padStart(8)}${'teacher'.padStart(9)}${'bo8'.padStart(8)}${'lenT'.padStart(7)}${'lenB'.padStart(7)}  document`);
  for (const r of rows) {
    const d = r.teacherCut - r.bonCut;
    console.log(
      `${(d >= 0 ? '+' : '') + d.toFixed(1)}`.padStart(8) + r.teacherCut.toFixed(1).padStart(9) + r.bonCut.toFixed(1).padStart(8) +
        r.teacherLen.toFixed(2).padStart(7) + r.bonLen.toFixed(2).padStart(7) + `  ${r.id}`,
    );
  }
}

console.log(`\n${'target'.padEnd(10)}${'n'.padStart(5)}${'cut'.padStart(9)}${'faith'.padStart(8)}${'length'.padStart(8)}`);
console.log('teacher'.padEnd(10) + String(rows.length).padStart(5) + mean(rows.map((r) => r.teacherCut)).toFixed(1).padStart(9) +
  mean(rows.map((r) => r.teacherFaith)).toFixed(3).padStart(8) + mean(rows.map((r) => r.teacherLen)).toFixed(3).padStart(8));
console.log('best-of-8'.padEnd(10) + String(rows.length).padStart(5) + mean(rows.map((r) => r.bonCut)).toFixed(1).padStart(9) +
  mean(rows.map((r) => r.bonFaith)).toFixed(3).padStart(8) + mean(rows.map((r) => r.bonLen)).toFixed(3).padStart(8));
console.log('mean-of-8'.padEnd(10) + String(rows.length).padStart(5) + mean(rows.map((r) => r.meanCut)).toFixed(1).padStart(9));
const headroom = rows.map((r) => r.bonCut - r.meanCut);
console.log(
  `\nselection headroom, best-of-8 minus mean-of-8: +${mean(headroom).toFixed(2)} +/-${ci(headroom).toFixed(2)} over ${headroom.length} documents`,
);

const d = rows.map((r) => r.teacherCut - r.bonCut);
const m = mean(d);
const c = ci(d);
console.log(
  `\npaired teacher minus best-of-8: ${m >= 0 ? '+' : ''}${m.toFixed(2)} +/-${c.toFixed(2)} over ${d.length} documents  ` +
    `(ahead on ${((100 * d.filter((x) => x > 0).length) / Math.max(1, d.length)).toFixed(0)}%)  ` +
    `${Math.abs(m) > c ? (m > 0 ? 'REAL' : 'WORSE') : 'SAME'}`,
);
if (noSample > 0) console.log(`${noSample} teacher rewrites had no sampled counterpart and were skipped`);
if (copied > 0) console.log(`${copied} teacher rewrites were copies of their input and were dropped`);
console.log(`documents where no sample passed the gates: ${items.length - rows.length}`);
console.log('\nGate for v16: at least +3.0 with the interval clear of zero.');
