import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, simplifyRoot } from '../lib/env.ts';
import { readJsonl, writeJsonPretty } from '../lib/store.ts';
import { maxRepetitionRatio, minProseRatio, proseRatio, repetitionRatio, stripEmoji } from '../lib/text.ts';
import {
  essayPath,
  lengthRatio,
  rewritePath,
  rewritesRoot,
  sourcesConfigPath,
  withinLengthBand,
  type HumanSource,
} from '../workflows/human-pairs.ts';

// Exports the human-pairs corpus as supervised fine-tuning data: the AI
// rewrite is the input and the human original is the completion, so the
// model learns to turn AI-styled text back into human-quality prose.
// Applies the length rubric (withinLengthBand) and the source screens, and
// holds out whole posts so no post straddles the train/eval split.
// PRIVATE: reads the gitignored corpus; the export dir is gitignored too.
//   tsx export-human-pairs.ts [--out runs/human-pairs-export] [--holdout 0.04]
//     [--min-ratio 0.7] [--max-ratio 1.3] [--include-trial trial-001]

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'runs/human-pairs-export' },
    holdout: { type: 'string', default: '0.04' },
    'min-ratio': { type: 'string', default: '0.7' },
    'max-ratio': { type: 'string', default: '1.3' },
    // Concat an existing trial export so the run also sees the judged
    // slop→fix pairs (they use the same message format).
    'include-trial': { type: 'string' },
  },
});

const config = loadConfig();
const minRatio = Number(values['min-ratio']);
const maxRatio = Number(values['max-ratio']);

interface RewriteMeta {
  sourceId: string;
  slug: string;
  model: string;
  words: number;
  sourceWords: number;
  truncated?: boolean;
}

const sftPromptVersion = 'rewrite-sft-v2';
const system = readFileSync(path.join(simplifyRoot, 'prompts', `${sftPromptVersion}.md`), 'utf8').trim();
const userPrefix = 'Simplify this:';

interface HumanPairRow {
  messages: { role: string; content: string }[];
  sourceId: string;
  model: string;
}

const sources = JSON.parse(readFileSync(sourcesConfigPath, 'utf8')) as HumanSource[];
const rows: { family: string; row: HumanPairRow }[] = [];
const dropped: Record<string, number> = {};
const drop = (reason: string) => {
  dropped[reason] = (dropped[reason] ?? 0) + 1;
};

for (const source of sources) {
  const dir = path.join(rewritesRoot, source.id);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const meta = JSON.parse(readFileSync(path.join(dir, name), 'utf8')) as RewriteMeta;
    if (meta.truncated) {
      drop('truncated');
      continue;
    }
    if (!withinLengthBand(meta.sourceWords, meta.words, minRatio, maxRatio)) {
      drop(lengthRatio(meta.sourceWords, meta.words) < minRatio ? 'too-short' : 'too-long');
      continue;
    }
    const original = readFileSync(essayPath(source.id, meta.slug), 'utf8');
    if (repetitionRatio(original) > maxRepetitionRatio) {
      drop('source-degenerate');
      continue;
    }
    if (proseRatio(original) < minProseRatio) {
      drop('source-mostly-code-or-markup');
      continue;
    }
    const rewrite = readFileSync(rewritePath(source.id, meta.slug, meta.model), 'utf8');
    rows.push({
      family: `${source.id}/${meta.slug}`,
      row: {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `${userPrefix}\n\n${stripEmoji(rewrite).trim()}` },
          { role: 'assistant', content: stripEmoji(original).trim() },
        ],
        sourceId: `${source.id}/${meta.slug}`,
        model: meta.model,
      },
    });
  }
}

// Post-atomic holdout: all rewrites of a held-out post leave training, so
// eval never sees a completion the model trained on.
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
const families = [...new Set(rows.map((r) => r.family))].sort();
const random = mulberry32(config.seed);
for (let i = families.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [families[i], families[j]] = [families[j], families[i]];
}
const holdoutFamilies = new Set(families.slice(0, Math.round(families.length * Number(values.holdout))));

const train: object[] = rows.filter((r) => !holdoutFamilies.has(r.family)).map((r) => r.row);
const holdout: object[] = rows.filter((r) => holdoutFamilies.has(r.family)).map((r) => r.row);

// Every row must share one column set: `datasets` casts the whole JSONL
// file to a single schema and fails on mixed keys.
interface TrialRow {
  messages: { role: string; content: string }[];
  sourceId: string;
  fixerModel?: string;
}
const normalizeTrialRow = (r: TrialRow): HumanPairRow => ({
  messages: r.messages,
  sourceId: r.sourceId,
  model: r.fixerModel ?? 'trial',
});

let trialRows = { train: 0, holdout: 0 };
if (values['include-trial']) {
  const trialExport = path.join(simplifyRoot, 'runs', values['include-trial'] as string, 'export');
  const trialTrain = readJsonl<TrialRow>(path.join(trialExport, 'train.jsonl'));
  const trialHoldout = readJsonl<TrialRow>(path.join(trialExport, 'holdout.jsonl'));
  train.push(...trialTrain.map(normalizeTrialRow));
  holdout.push(...trialHoldout.map(normalizeTrialRow));
  trialRows = { train: trialTrain.length, holdout: trialHoldout.length };
}

const outDir = path.join(simplifyRoot, values.out as string);
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'train.jsonl'), train.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
writeFileSync(path.join(outDir, 'holdout.jsonl'), holdout.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
writeJsonPretty(path.join(outDir, 'manifest.json'), {
  exportedAt: new Date().toISOString(),
  sftPromptVersion,
  band: { minRatio, maxRatio },
  holdoutFraction: Number(values.holdout),
  humanPairs: rows.length,
  trialRows,
  train: train.length,
  holdout: holdout.length,
  dropped,
  seed: config.seed,
});
console.log(`human pairs kept: ${rows.length}, dropped:`, JSON.stringify(dropped));
console.log(`train: ${train.length} rows, holdout: ${holdout.length} rows (${holdoutFamilies.size} posts held out)`);
console.log(`export dir: ${outDir}`);
