import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, simplifyRoot } from '../lib/env.ts';
import { readJsonl, sha256, trialDir, trialFile, writeJsonPretty } from '../lib/store.ts';
import { maxRepetitionRatio, minProseRatio, proseRatio, repetitionRatio, stripEmoji } from '../lib/text.ts';

// Assembles the supervised fine-tuning dataset from every accepted pair:
// unanimous accepts, human keeps, rejudge accepts, and refix accepts.
// Applies the source screens retroactively, strips emoji, and holds out
// whole prompt families (~20%) so no family straddles the split.

const { values } = parseArgs({
  options: {
    trial: { type: 'string' },
    holdout: { type: 'string', default: '0.2' },
  },
});

if (!values.trial) {
  console.error('usage: tsx export.ts --trial <name> [--holdout 0.2]');
  process.exit(2);
}
const trial = values.trial as string;
const config = loadConfig();

interface PairRecord {
  sourceId: string;
  promptId: string | null;
  generatorModel: string | null;
  fixerModel: string;
  original: string;
  rewrite: string | null;
}

const accepted = readJsonl<PairRecord>(trialFile(trial, 'accepted.jsonl'));
const humanReview = readJsonl<PairRecord>(trialFile(trial, 'human-review.jsonl'));
const byId = new Map(humanReview.map((r) => [r.sourceId, r]));

const verdicts = readJsonl<{ sourceId: string; verdict: string }>(trialFile(trial, 'human-verdicts.jsonl'));
const keeps = verdicts.filter((v) => v.verdict === 'keep').map((v) => byId.get(v.sourceId)).filter((r): r is PairRecord => r !== undefined);

const rejudged = readJsonl<{ sourceId: string; outcome: string }>(trialFile(trial, 'rejudge.jsonl'));
const rescued = rejudged.filter((r) => r.outcome === 'accepted').map((r) => byId.get(r.sourceId)).filter((r): r is PairRecord => r !== undefined);

const refixed = readJsonl<{ sourceId: string; outcome: string; rewrite: string }>(trialFile(trial, 'refix.jsonl'))
  .filter((r) => r.outcome === 'accepted')
  .map((r) => {
    const base = byId.get(r.sourceId);
    return base === undefined ? undefined : { ...base, rewrite: r.rewrite };
  })
  .filter((r): r is PairRecord => r !== undefined);

const pool = [...accepted, ...keeps, ...rescued, ...refixed];
const seen = new Set<string>();
const screened: PairRecord[] = [];
const droppedByScreen: { sourceId: string; reason: string }[] = [];
for (const rec of pool) {
  if (rec.rewrite === null || seen.has(rec.sourceId)) continue;
  seen.add(rec.sourceId);
  if (repetitionRatio(rec.original) > maxRepetitionRatio) {
    droppedByScreen.push({ sourceId: rec.sourceId, reason: 'source-degenerate' });
    continue;
  }
  if (proseRatio(rec.original) < minProseRatio) {
    droppedByScreen.push({ sourceId: rec.sourceId, reason: 'source-mostly-code-or-markup' });
    continue;
  }
  screened.push(rec);
}

// Family-atomic holdout: whole prompt families leave the training set.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const families = [...new Set(screened.map((r) => r.promptId ?? 'unknown'))].sort();
const random = mulberry32(config.seed);
for (let i = families.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [families[i], families[j]] = [families[j], families[i]];
}
const holdoutFamilies = new Set(families.slice(0, Math.round(families.length * Number(values.holdout))));

const sftPromptVersion = 'rewrite-sft-v2';
const system = readFileSync(path.join(simplifyRoot, 'prompts', `${sftPromptVersion}.md`), 'utf8').trim();
// A short task prefix on every user turn makes intent explicit at inference,
// so callers can send "Simplify this:" plus a document and nothing else.
const userPrefix = 'Simplify this:';
const toExample = (r: PairRecord) => ({
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: `${userPrefix}\n\n${stripEmoji(r.original).trim()}` },
    { role: 'assistant', content: stripEmoji(r.rewrite as string).trim() },
  ],
  sourceId: r.sourceId,
  promptId: r.promptId,
  generatorModel: r.generatorModel,
  fixerModel: r.fixerModel,
});

const train = screened.filter((r) => !holdoutFamilies.has(r.promptId ?? 'unknown'));
const holdout = screened.filter((r) => holdoutFamilies.has(r.promptId ?? 'unknown'));

const outDir = path.join(trialDir(trial), 'export');
mkdirSync(outDir, { recursive: true });
const trainPath = path.join(outDir, 'train.jsonl');
const holdoutPath = path.join(outDir, 'holdout.jsonl');
writeFileSync(trainPath, train.map((r) => JSON.stringify(toExample(r))).join('\n') + '\n', 'utf8');
writeFileSync(holdoutPath, holdout.map((r) => JSON.stringify(toExample(r))).join('\n') + '\n', 'utf8');

writeJsonPretty(path.join(outDir, 'manifest.json'), {
  trial,
  exportedAt: new Date().toISOString(),
  sftPromptVersion,
  sftPromptSha256: sha256(system),
  userPrefix,
  seed: config.seed,
  pool: pool.length,
  unique: seen.size,
  droppedByScreen,
  train: train.length,
  holdout: holdout.length,
  holdoutFamilies: [...holdoutFamilies].sort(),
  trainSha256: sha256(readFileSync(trainPath, 'utf8')),
  holdoutSha256: sha256(readFileSync(holdoutPath, 'utf8')),
});

console.log(`pool ${pool.length} -> unique ${seen.size} -> screened ${screened.length} (dropped ${droppedByScreen.length})`);
console.log(`train ${train.length} / holdout ${holdout.length} (families: ${holdoutFamilies.size} of ${families.length})`);
console.log(`wrote ${outDir}`);
