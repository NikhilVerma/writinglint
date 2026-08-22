// Builds the stage-1 SFT set for the mixed run.
//
// Two kinds of example, both from text we already own:
//
//   repair      corrupted document -> the human original
//   self-target human original     -> the same text, unchanged
//
// The self-target half is the point. GRPO cannot teach a model to hand back
// text that needs no work, because the echo gate zeroes the reward on anything
// near a copy. A supervised example whose target is its own input teaches it
// directly. The idempotence benchmark measured v7 rewriting 72% of Paul
// human originals; this is the lever aimed at that number.
//
//   npx tsx src/cli/pair-quality.ts            # once, ~2.4h, resumable
//   npx tsx src/cli/sft-dataset.ts --out runs/sft-v10 --minGap 5
//
// Both halves are filtered on measured quality, and that is the whole change
// between v9 and v10.
//
// v9 was built from every pair in the corpus. Scored on the metric the reward
// uses, those pairs move a document 2.3 weighted findings per 1k at the median
// and on 39% of them the human "answer" is DIRTIER than the AI text it is
// paired with. v9 learned that exactly: it cuts 2.6 per 1k against the base
// model's 6.3, leaves 29% of prose dirtier than it found it, and makes
// technical documents worse on average. It is beautifully stable and it does
// not do the job. Nothing in the reward can repair a dataset that never showed
// the model a real cleanup.
//
// So a repair pair has to earn its place: the target must be measurably
// cleaner than the input, must land inside its own domain's band, and must not
// be a near-copy of the input it is supposed to improve on.
//
// And a self-target has to be text that genuinely needs no work. v9 drew them
// from every human original regardless of density, and only 54% of those sit
// inside the band, so nearly half of its self-target examples taught "hand
// back out-of-band text unchanged" rather than "hand back FINISHED text
// unchanged". That is the copying reflex, taught directly.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig } from '../lib/env.ts';
import { extractAnchors } from '../lib/faithfulness.ts';
import { readJsonl } from '../lib/store.ts';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'runs/sft-v8' },
    selfTargetShare: { type: 'string', default: '0.25' },
    benchN: { type: 'string', default: '120' },
    benchMinWords: { type: 'string', default: '150' },
    benchMaxWords: { type: 'string', default: '1800' },
    seed: { type: 'string', default: '42' },
    holdoutShare: { type: 'string', default: '0.05' },
    quality: { type: 'string', default: 'runs/pair-quality.jsonl' },
    /** Weighted findings per 1k the target must beat its input by. Below about
     * 5 the pair is teaching rewording rather than cleaning: the median
     * unfiltered pair sits at 2.3 and produced a model that cleans 2.6. */
    minGap: { type: 'string', default: '5' },
    /** Share of the target's 4-grams lifted from its own input, as a last
     * guard against a target that IS its input. Deliberately loose. A tighter
     * 0.5 threw away 104 of the 149 usable technical pairs, because a targeted
     * repair of a partly-corrupted document is supposed to keep most of its
     * text — that is the minimal edit the fixed point is made of. With the gap
     * filter already in front of it, high overlap plus a real cleanup is the
     * best kind of example, not the worst. On essay pairs it changes nothing:
     * 316 survive at either threshold. */
    maxOverlap: { type: 'string', default: '0.9' },
    /** Corrupted-technical pairs, as <inputDir>:<targetDir>, plus the file
     * pair-quality.ts scored them into. The essay corpus contains no technical
     * writing at all, which is why v9 makes pull-request descriptions WORSE:
     * it cuts -2.3 findings per 1k on them and leaves half of them dirtier. */
    techPairs: { type: 'string', default: 'runs/docs-corrupt:runs/docs-prose' },
    techQuality: { type: 'string', default: 'runs/pair-quality-tech.jsonl' },
  },
});

interface Pair { messages: { role: string; content: string }[]; sourceId: string }
const train = readJsonl<Pair>('runs/human-pairs-export/train.jsonl');

const roleOf = (p: Pair, role: string) => p.messages.find((m) => m.role === role)?.content ?? '';
const system = roleOf(train[0], 'system');
const wordCount = (t: string) => t.split(/\s+/).filter((w) => w !== '').length;

const config = loadConfig().reward;

/** Same rule the reward uses, so the dataset and the scorer agree on what kind
 * of writing a document is. Anchor density alone, no linting needed. */
function bandFor(text: string): [number, number] {
  const anchors = extractAnchors(text);
  const per100 = (100 * (anchors.numbers.size + anchors.symbols.size)) / Math.max(1, wordCount(text));
  return per100 >= config.technicalAnchorsPer100Words ? config.domains.technical.band : config.domains.prose.band;
}

interface Quality { index: number; gap: number; tgtPer1k: number; overlap: number }
const quality = new Map<number, Quality>();
for (const row of readJsonl<Quality>(values.quality as string)) quality.set(row.index, row);
if (quality.size === 0) throw new Error(`no rows in ${values.quality}; run pair-quality.ts first`);
if (quality.size < train.length) {
  console.error(`WARNING: only ${quality.size}/${train.length} pairs scored. Unscored pairs are dropped, not kept.`);
}

const minGap = Number(values.minGap);
const maxOverlap = Number(values.maxOverlap);

/** A pair earns its place by being a measurable cleanup, or it is dropped. */
function isRealRepair(index: number, target: string): boolean {
  const q = quality.get(index);
  if (!q) return false;
  if (q.gap < minGap) return false;
  if (q.overlap > maxOverlap) return false;
  // Landing above its own band means the answer is still slop by the reward's
  // own measure, whatever the gap was.
  return q.tgtPer1k <= bandFor(target)[1];
}

// The idempotence benchmark samples the assistant side of train.jsonl. Training
// on those same documents would let the model memorise them and turn the
// benchmark into a training-set score. This reproduces that selection exactly
// so the documents can be held out. Keep it in step with idempotence.ts.
function benchmarkIds(): Set<string> {
  const seen = new Set<string>();
  const pool: string[] = [];
  for (const row of train) {
    if (seen.has(row.sourceId)) continue;
    seen.add(row.sourceId);
    const n = wordCount(roleOf(row, 'assistant').trim());
    if (n < Number(values.benchMinWords) || n > Number(values.benchMaxWords)) continue;
    pool.push(row.sourceId);
  }
  pool.sort((a, b) => a.localeCompare(b));
  const step = Math.max(1, Math.floor(pool.length / Number(values.benchN)));
  return new Set(pool.filter((_, i) => i % step === 0).slice(0, Number(values.benchN)));
}

const excluded = benchmarkIds();
console.error(`holding out ${excluded.size} benchmarked documents from training`);

const withIndex = train.map((p, index) => ({ ...p, index }));
const eligibleRepair = withIndex.filter((p) => !excluded.has(p.sourceId));
const repair = eligibleRepair.filter((p) => isRealRepair(p.index, roleOf(p, 'assistant').trim()));
console.error(
  `repair pairs: ${repair.length}/${eligibleRepair.length} kept ` +
    `(gap >= ${minGap}/1k, overlap <= ${maxOverlap}, target inside its band)`,
);
if (repair.length === 0) throw new Error('every repair pair was filtered out; loosen --minGap');

// One self-target example per unique document, and only documents that are
// already inside their own band. A self-target says "this text is finished,
// hand it back". Drawn from every human original regardless of density, that
// sentence is false on 46% of them, and the model learns the shorter lesson:
// hand it back. The pool is the eligible set rather than the filtered repair
// set, so tightening --minGap does not also starve this half.
const uniqueDocs = new Map<string, string>();
let selfConsidered = 0;
for (const p of eligibleRepair) {
  const text = roleOf(p, 'assistant').trim();
  if (text === '' || uniqueDocs.has(p.sourceId)) continue;
  selfConsidered += 1;
  const q = quality.get(p.index);
  if (!q) continue;
  const [low, high] = bandFor(text);
  if (q.tgtPer1k < low || q.tgtPer1k > high) continue;
  uniqueDocs.set(p.sourceId, text);
}
console.error(`self-target pool: ${uniqueDocs.size}/${selfConsidered} documents already inside their band`);
const docs = [...uniqueDocs.entries()].sort((a, b) => a[0].localeCompare(b[0]));

const share = Number(values.selfTargetShare);
const holdoutShare = Number(values.holdoutShare);

// Seeded shuffle so the split is random but reproducible. The previous build
// ordered everything by sourceId, which walked the corpus alphabetically and
// put each document's repair and self-target rows next to each other.
let state = (Number(values.seed) || 42) >>> 0;
const nextRandom = (): number => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0x100000000;
};
const shuffled = <T>(items: readonly T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// Split on documents, not rows. A document's repair row targets the same human
// text its self-target row reproduces, so splitting per row would put that text
// on both sides and leak the answer into the holdout.
const splitDocs = shuffled(docs.map(([sourceId]) => sourceId));
const holdoutDocs = new Set(splitDocs.slice(0, Math.round(splitDocs.length * holdoutShare)));

const selfTargetFor = (sourceId: string, text: string) => ({
  sourceId,
  kind: 'self-target',
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: `Simplify this:\n\n${text}` },
    { role: 'assistant', content: text },
  ],
});

/** Both sides are built the same way and carry the same mix of kinds. The old
 * holdout was 100% repair, so eval loss never measured the one behaviour this
 * stage exists to teach and stayed flat while the model learned it. */
function build(wantHoldout: boolean) {
  const pairs = repair.filter((p) => holdoutDocs.has(p.sourceId) === wantHoldout);
  const eligible = docs.filter(([sourceId]) => holdoutDocs.has(sourceId) === wantHoldout);
  const wanted = Math.round((share * pairs.length) / (1 - share));
  const picked = shuffled(eligible).slice(0, Math.min(wanted, eligible.length));
  return shuffled([
    ...pairs.map((p) => ({ sourceId: p.sourceId, kind: 'repair', messages: p.messages })),
    ...picked.map(([sourceId, text]) => selfTargetFor(sourceId, text)),
  ]);
}

// Technical repair pairs, read from directories and filtered the same way.
const techRows: { sourceId: string; kind: string; messages: { role: string; content: string }[] }[] = [];
if (values.techPairs && existsSync(values.techQuality as string)) {
  const techQuality = new Map<string, Quality & { sourceId?: string }>();
  for (const row of readJsonl<Quality & { sourceId: string }>(values.techQuality as string)) {
    techQuality.set(row.sourceId, row);
  }
  const [inputDir, targetDir] = (values.techPairs as string).split(':');
  for (const name of readdirSync(inputDir).filter((f) => f.endsWith('.md')).sort()) {
    const targetPath = path.join(targetDir, name);
    if (!existsSync(targetPath)) continue;
    const sourceId = name.replace(/\.md$/, '');
    const q = techQuality.get(sourceId);
    if (!q) continue;
    const target = readFileSync(targetPath, 'utf8').trim();
    if (q.gap < minGap || q.overlap > maxOverlap || q.tgtPer1k > bandFor(target)[1]) continue;
    techRows.push({
      sourceId: `tech/${sourceId}`,
      kind: 'repair-technical',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Simplify this:\n\n${readFileSync(path.join(inputDir, name), 'utf8').trim()}` },
        { role: 'assistant', content: target },
      ],
    });
  }
  console.error(`technical repair pairs: ${techRows.length} kept`);
}

// Technical pairs go entirely into train. There are too few to split, and the
// holdout already measures the behaviour this stage teaches.
const rows = shuffled([...build(false), ...techRows]);
const holdoutRows = build(true);

const outDir = values.out as string;
mkdirSync(outDir, { recursive: true });
const write = (name: string, list: unknown[]) =>
  writeFileSync(path.join(outDir, name), `${list.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8');
write('train.jsonl', rows);
write('holdout.jsonl', holdoutRows);

const describe = (label: string, list: { kind: string }[]) => {
  const self = list.filter((r) => r.kind === 'self-target').length;
  console.error(`${label}: ${list.length} rows (${list.length - self} repair, ${self} self-target = ${((self / list.length) * 100).toFixed(0)}%)`);
};
describe('train', rows);
describe('holdout', holdoutRows);
console.error(`wrote ${outDir}/train.jsonl and ${outDir}/holdout.jsonl`);
