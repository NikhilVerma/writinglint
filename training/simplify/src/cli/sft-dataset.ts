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
  },
});

interface Pair { messages: { role: string; content: string }[]; sourceId: string }
const train = readJsonl<Pair>('runs/human-pairs-export/train.jsonl');
const holdout = readJsonl<Pair>('runs/human-pairs-export/holdout.jsonl');

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
// Solve for a self-target count that is `share` of the finished set.
const wanted = Math.round((share * repair.length) / (1 - share));
const stride = Math.max(1, Math.floor(docs.length / Math.min(wanted, docs.length)));
const selfTarget = docs
  .filter((_, i) => i % stride === 0)
  .slice(0, wanted)
  .map(([sourceId, text]) => ({
    sourceId,
    kind: 'self-target',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Simplify this:\n\n${text}` },
      { role: 'assistant', content: text },
    ],
  }));

const rows = [
  ...repair.map((p) => ({ sourceId: p.sourceId, kind: 'repair', messages: p.messages })),
  ...selfTarget,
];

// Interleaved rather than concatenated. Grouped by kind, the trainer would see
// every repair example before any self-target one and the lesson would arrive
// as a late correction instead of a constraint held throughout.
rows.sort((a, b) => {
  const key = (r: typeof a) => `${r.sourceId}|${r.kind}`;
  return key(a).localeCompare(key(b));
});

const outDir = values.out as string;
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'train.jsonl'), `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8');
writeFileSync(path.join(outDir, 'holdout.jsonl'), `${holdout.map((r) => JSON.stringify({ sourceId: r.sourceId, kind: 'repair', messages: r.messages })).join('\n')}\n`, 'utf8');

const actual = selfTarget.length / rows.length;
console.error(`train: ${rows.length} rows (${repair.length} repair, ${selfTarget.length} self-target = ${(actual * 100).toFixed(0)}%)`);
console.error(`holdout: ${holdout.length} rows`);
console.error(`wrote ${outDir}/train.jsonl and ${outDir}/holdout.jsonl`);
