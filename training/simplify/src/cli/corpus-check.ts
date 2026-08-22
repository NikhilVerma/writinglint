// Validates a corrupted-to-original corpus before it becomes training data.
//
//   npx tsx src/cli/corpus-check.ts runs/docs-2018-corrupt runs/docs-2018
//
// A (slop -> human) pair is only worth training on if three things hold, and
// each has already failed at least once in this project:
//
//   facts survive    The corrupter must change how the document is written and
//                    nothing about what it claims. A dropped version number or
//                    an invented percentage teaches the cleaner to hallucinate,
//                    which is exactly the failure sft-v9 shipped with: 1.56
//                    invented anchors per technical document.
//   slop landed      A corruption that adds nothing teaches nothing. v9 was
//                    trained on pairs teaching a 2.6 per 1k cleanup, and it
//                    learned that number almost exactly.
//   nothing leaked   No sentence about the rewriting task, the tooling, or this
//                    repository may reach the corpus. Generators must never
//                    learn what they are being measured on.
//
// Everything that fails is listed by filename so it can be regenerated rather
// than silently averaged away.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { loadConfig, simplifyRoot } from '../lib/env.ts';
import { faithfulness } from '../lib/faithfulness.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';

const [corruptArg, originalArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!corruptArg || !originalArg) throw new Error('usage: corpus-check <corrupt-dir> <original-dir>');

const config = loadConfig();
const corruptDir = path.resolve(simplifyRoot, corruptArg);
const originalDir = path.resolve(simplifyRoot, originalArg);
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const quantile = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))];

// Phrases that only appear if the generator talked about its own task. Kept
// deliberately blunt: a false positive costs one regenerated document, a false
// negative poisons the corpus.
const LEAK = /slopsift|writinglint|rule-?pack|\bthe (original|source) (document|text)\b|I (have )?(rewrote|rewritten|corrupted)|as requested|here('| i)s the rewritten|LLM-style|AI-generated slop/i;

const files = readdirSync(corruptDir).filter((f) => f.endsWith('.md'));
const missing = files.filter((f) => !readdirSync(originalDir).includes(f));
const pairs = files.filter((f) => !missing.includes(f));

interface Row { file: string; gap: number; kept: number; invented: number; ratio: number; leak: boolean }
const rows: Row[] = [];
const chunk = 60;
for (let start = 0; start < pairs.length; start += chunk) {
  const batch = pairs.slice(start, start + chunk);
  const texts = new Map<string, string>();
  for (const f of batch) {
    texts.set(`c-${f}`, readFileSync(path.join(corruptDir, f), 'utf8'));
    texts.set(`o-${f}`, readFileSync(path.join(originalDir, f), 'utf8'));
  }
  const findings = await lintTexts(texts, config);
  const per1k = (key: string, text: string) =>
    (weighFindings(findings.get(key) ?? [], config.reward.levelWeights, config.reward.scoredRules) * 1000) /
    Math.max(1, words(text));
  for (const f of batch) {
    const corrupt = texts.get(`c-${f}`) as string;
    const original = texts.get(`o-${f}`) as string;
    // Anchors are checked corrupt -> original, the direction the model will be
    // asked to travel, so a dropped anchor here is one it would have to invent.
    const anchors = faithfulness(corrupt, original);
    rows.push({
      file: f,
      gap: per1k(`c-${f}`, corrupt) - per1k(`o-${f}`, original),
      kept: anchors.keptRate,
      invented: anchors.inventedCount,
      ratio: words(corrupt) / Math.max(1, words(original)),
      leak: LEAK.test(corrupt),
    });
  }
}

const weak = rows.filter((r) => r.gap < 5);
const unfaithful = rows.filter((r) => r.kept < 0.9);
const leaked = rows.filter((r) => r.leak);
const shrunk = rows.filter((r) => r.ratio < 1);
const bad = new Set([...weak, ...unfaithful, ...leaked].map((r) => r.file));

console.log(`${pairs.length} pairs checked, ${missing.length} corrupted files with no original\n`);
console.log(`slop added   mean ${mean(rows.map((r) => r.gap)).toFixed(1)}/1k   median ${quantile(rows.map((r) => r.gap), 0.5).toFixed(1)}   p10 ${quantile(rows.map((r) => r.gap), 0.1).toFixed(1)}`);
console.log(`anchors kept mean ${mean(rows.map((r) => r.kept)).toFixed(3)}   invented mean ${mean(rows.map((r) => r.invented)).toFixed(2)}`);
console.log(`length ratio mean ${mean(rows.map((r) => r.ratio)).toFixed(2)}   grew in ${rows.length - shrunk.length}/${rows.length}\n`);
console.log(`REJECTED ${bad.size}/${pairs.length}`);
console.log(`  ${weak.length} added under 5 findings per 1k`);
console.log(`  ${unfaithful.length} dropped more than 10% of the original's anchors`);
console.log(`  ${leaked.length} leaked task or tooling language`);

for (const [label, list] of [['weak', weak], ['unfaithful', unfaithful], ['leaked', leaked]] as const) {
  if (list.length) console.log(`\n${label}:\n${list.slice(0, 40).map((r) => `  ${r.file}`).join('\n')}${list.length > 40 ? `\n  ... and ${list.length - 40} more` : ''}`);
}
