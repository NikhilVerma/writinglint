// The v15 rewrite prompts: hard prose, from two sources that fail differently.
//
//   npx tsx src/cli/v15-prompts.ts --out v15-prompts
//
// v14 trained on documents averaging 21 weighted findings per 1k and was graded
// on documents averaging twice that, so the lesson it needed was never in the
// data. Two corpora fix that between them, and neither does alone:
//
//   The human-pairs slop was written by a stronger model asked to spoil a real
//   essay. It matches the benchmark on the structural habits - sentence-load
//   14.92 against 14.60, aside-pileup 4.19 against 4.26 - which is the half an
//   8B could not manufacture on request.
//
//   The 8B's own corruption pass overshoots the lexical tells the stronger
//   model never added: throat-clearing, chatbot idioms, intensifiers. Those are
//   absent from human writing by construction and so absent from every corpus
//   drawn from it.
//
// Benchmark documents are excluded by id and, in best-of-n, by 8-gram overlap.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';

const { values } = parseArgs({
  options: {
    slop: { type: 'string', default: 'runs/human-pairs-export/train.jsonl' },
    corrupt: { type: 'string', default: 'corrupt-full' },
    prompt: { type: 'string', default: 'prompts/rewrite-sft-v3.md' },
    out: { type: 'string', default: 'v15-prompts' },
    chunk: { type: 'string', default: '30' },
    minWords: { type: 'string', default: '150' },
  },
});

const config = loadConfig();
const system = readFileSync(values.prompt as string, 'utf8').trim();

/** Every benchmark document, so none of them can become training input. */
const benchIds = new Set<string>();
const benchHeads = new Set<string>();
for (const line of readFileSync(path.join(runsDir, 'drift-inputs-v11.jsonl'), 'utf8').split('\n')) {
  if (line.trim() === '') continue;
  const row = JSON.parse(line) as { id: string; input: string };
  benchIds.add(row.id.split('#')[0]);
  benchHeads.add(row.input.slice(0, 200));
}

const candidates: { id: string; source: string; human?: string }[] = [];

const seen = new Set<string>();
for (const line of readFileSync(values.slop as string, 'utf8').split('\n')) {
  if (line.trim() === '') continue;
  const row = JSON.parse(line) as { messages: { content: string }[]; sourceId: string };
  if (seen.has(row.sourceId) || benchIds.has(row.sourceId)) continue;
  seen.add(row.sourceId);
  const source = row.messages[1].content.replace(/^Simplify this:\n\n/, '');
  if (benchHeads.has(source.slice(0, 200))) continue;
  candidates.push({ id: `slop-${row.sourceId}`, source, human: row.messages[2].content });
}
const fromSlop = candidates.length;

const corruptFile = path.join(runsDir, `${values.corrupt as string}.jsonl`);
if (existsSync(corruptFile)) {
  let i = 0;
  for (const line of readFileSync(corruptFile, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    const row = JSON.parse(line) as { source: string; outputs: string[] };
    const text = (row.outputs[0] ?? '').trim();
    i += 1;
    if (text === '' || benchHeads.has(text.slice(0, 200))) continue;
    // The seed's own text is the "clean" side, kept only so a later pass can
    // ask whether the human original would have beaten the model's rewrite.
    candidates.push({ id: `corrupt-${i}`, source: text, human: row.source });
  }
}

const out: string[] = [];
let tooEasy = 0;
let wrongDomain = 0;
const chunk = Number(values.chunk);
const minWords = Number(values.minWords);
for (let i = 0; i < candidates.length; i += chunk) {
  const batch = candidates.slice(i, i + chunk);
  const texts = new Map<string, string>();
  batch.forEach((c, j) => texts.set(`s-${i + j}`, c.source));
  const found = await lintTexts(texts, config);
  batch.forEach((c, j) => {
    if (c.source.split(/\s+/).filter(Boolean).length < minWords) return;
    const w = weighFindings(found.get(`s-${i + j}`) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules);
    const t = scoreRewrite({ source: c.source, output: c.source, sourceFindings: w, outputFindings: w, config: config.reward });
    if (t.domain !== 'prose') {
      wrongDomain += 1;
      return;
    }
    // A document already in band has nothing to teach: handing it back is the
    // right answer and best-of-n would only select a copy.
    if (t.sourceFindingsPer1kWords <= config.reward.domains.prose.band[1]) {
      tooEasy += 1;
      return;
    }
    out.push(
      JSON.stringify({
        id: c.id,
        source: c.source,
        human: c.human ?? '',
        prompt: [
          { role: 'system', content: system },
          { role: 'user', content: `Simplify this:\n\n${c.source}` },
        ],
      }),
    );
  });
  console.log(`[v15] ${Math.min(i + chunk, candidates.length)}/${candidates.length}`);
}

const file = path.join(runsDir, `${values.out as string}.jsonl`);
writeFileSync(file, `${out.join('\n')}\n`);
console.log(
  `wrote ${out.length} hard prose prompts to ${file}\n` +
    `  ${fromSlop} candidates from the stronger model's slop, ${candidates.length - fromSlop} from the 8B's corruption pass\n` +
    `  dropped ${tooEasy} already in band, ${wrongDomain} technical`,
);
