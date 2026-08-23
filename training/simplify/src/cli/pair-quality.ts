// Scores every SFT pair on the same metric the reward uses, so the dataset can
// be filtered by measured quality instead of by faith in how it was built.
//
//   npx tsx src/cli/pair-quality.ts --from runs/human-pairs-export/train.jsonl \
//     --out runs/pair-quality.jsonl
//
// This exists because of what the measurement found. The repair pairs teach
// the model to move a document 2.3 weighted findings per 1k at the median, and
// on 39% of them the "correct answer" is DIRTIER than the input it is paired
// with. v9 then cut 2.3 per 1k and left 31% of the benchmark dirtier than it
// found it. The model learned its data exactly. The data was the ceiling.
//
// Resumable: rows already in --out are skipped, so a killed run continues.

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig } from '../lib/env.ts';
import { echoRate } from '../lib/faithfulness.ts';
import { weighFindings } from '../lib/findings.ts';
import { findingsPer1kWords } from '../lib/reward.ts';
import { readJsonl } from '../lib/store.ts';
import { lintTexts } from '../lib/lint-batch.ts';

const { values } = parseArgs({
  options: {
    from: { type: 'string', default: 'runs/human-pairs-export/train.jsonl' },
    out: { type: 'string', default: 'runs/pair-quality.jsonl' },
    /** Directory pairs instead of a jsonl: --dirs <inputDir>:<targetDir>, matched
     * on filename. This is how the corrupted technical corpus is scored. */
    dirs: { type: 'string', default: '' },
    chunk: { type: 'string', default: '120' },
  },
});

interface Pair { messages: { role: string; content: string }[]; sourceId: string }
const config = loadConfig();

/** A directory pair is read into the same message shape, so one scorer serves
 * both corpora and the filters downstream do not care where a pair came from. */
function fromDirs(spec: string): Pair[] {
  const [inputDir, targetDir] = spec.split(':');
  if (!inputDir || !targetDir) throw new Error('--dirs wants <inputDir>:<targetDir>');
  const out: Pair[] = [];
  for (const name of readdirSync(inputDir).filter((f) => f.endsWith('.md')).sort()) {
    const target = path.join(targetDir, name);
    if (!existsSync(target)) continue;
    out.push({
      sourceId: name.replace(/\.md$/, ''),
      messages: [
        { role: 'system', content: '' },
        { role: 'user', content: `Simplify this:\n\n${readFileSync(path.join(inputDir, name), 'utf8').trim()}` },
        { role: 'assistant', content: readFileSync(target, 'utf8').trim() },
      ],
    });
  }
  return out;
}

const rows = values.dirs ? fromDirs(values.dirs as string) : readJsonl<Pair>(values.from as string);
const outPath = values.out as string;
mkdirSync(path.dirname(outPath), { recursive: true });

const done = new Set<number>();
if (existsSync(outPath)) {
  for (const line of readFileSync(outPath, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    done.add((JSON.parse(line) as { index: number }).index);
  }
  console.error(`resuming: ${done.size} rows already scored`);
}

const roleOf = (p: Pair, role: string) => p.messages.find((m) => m.role === role)?.content ?? '';
const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;
const stripPrefix = (t: string) => (t.startsWith('Simplify this:') ? t.slice('Simplify this:'.length) : t).trim();

const chunkSize = Number(values.chunk);
const pending = rows.map((row, index) => ({ row, index })).filter((r) => !done.has(r.index));

for (let start = 0; start < pending.length; start += chunkSize) {
  const batch = pending.slice(start, start + chunkSize);
  const texts = new Map<string, string>();
  for (const { row, index } of batch) {
    texts.set(`i-${index}`, stripPrefix(roleOf(row, 'user')));
    texts.set(`t-${index}`, roleOf(row, 'assistant').trim());
  }
  const findings = await lintTexts(texts, config);
  for (const { row, index } of batch) {
    const input = stripPrefix(roleOf(row, 'user'));
    const target = roleOf(row, 'assistant').trim();
    const inWords = wordCount(input);
    const tgtWords = wordCount(target);
    if (inWords === 0 || tgtWords === 0) continue;
    const srcPer1k = findingsPer1kWords(
      weighFindings(findings.get(`i-${index}`) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules),
      inWords,
    );
    const tgtPer1k = findingsPer1kWords(
      weighFindings(findings.get(`t-${index}`) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules),
      tgtWords,
    );
    appendFileSync(
      outPath,
      `${JSON.stringify({
        index,
        sourceId: row.sourceId,
        words: tgtWords,
        srcPer1k: Math.round(srcPer1k * 1e3) / 1e3,
        tgtPer1k: Math.round(tgtPer1k * 1e3) / 1e3,
        gap: Math.round((srcPer1k - tgtPer1k) * 1e3) / 1e3,
        // How much of the target is lifted from its own input. A high number
        // means the pair teaches copying, in the same run that GRPO is paying
        // to punish it.
        overlap: Math.round(echoRate(target, input) * 1e3) / 1e3,
        lengthRatio: Math.round((tgtWords / inWords) * 1e4) / 1e4,
      })}\n`,
      'utf8',
    );
  }
  console.error(`scored ${Math.min(start + chunkSize, pending.length)}/${pending.length}`);
}
console.error(`wrote ${outPath}`);
