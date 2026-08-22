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
//   npx tsx src/cli/sft-dataset.ts --out runs/sft-v8 --selfTargetShare 0.25

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

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
  },
});

interface Pair { messages: { role: string; content: string }[]; sourceId: string }
const train = readJsonl<Pair>('runs/human-pairs-export/train.jsonl');

const roleOf = (p: Pair, role: string) => p.messages.find((m) => m.role === role)?.content ?? '';
const system = roleOf(train[0], 'system');
const wordCount = (t: string) => t.split(/\s+/).filter((w) => w !== '').length;

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

const repair = train.filter((p) => !excluded.has(p.sourceId));

// One self-target example per unique document, drawn from the same pool the
// repair examples use. Deterministic pick so the set can be rebuilt.
const uniqueDocs = new Map<string, string>();
for (const p of repair) {
  const text = roleOf(p, 'assistant').trim();
  if (text !== '' && !uniqueDocs.has(p.sourceId)) uniqueDocs.set(p.sourceId, text);
}
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

const rows = build(false);
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
