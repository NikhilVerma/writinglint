// Manufacture the documents the training set does not have.
//
//   npx tsx src/cli/corrupt-prompts.ts --limit 700 --out corrupt-prompts
//
// The benchmark's hard prose is twice as messy as anything in the corpus, and
// habit-mix says the shortfall is specific: hidden actors, piled-up evidence,
// throat-clearing, chatbot idioms. Those are machine tells, so a corpus of
// human writing cannot contain them and no amount of resampling invents them.
//
// This picks the cleanest human prose available and asks the model to spoil it
// in exactly those ways, keeping every fact. What comes back is a hard input
// whose clean version is known. The rewrite targets are still drawn by
// best-of-n from the student itself - the seed's original text is NOT used as a
// target, because training a model to invert one corruption prompt teaches it
// that prompt rather than the habit.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';

const { values } = parseArgs({
  options: {
    in: { type: 'string', default: 'samples-8b' },
    prompt: { type: 'string', default: 'prompts/corrupt-v1.md' },
    out: { type: 'string', default: 'corrupt-prompts' },
    domain: { type: 'string', default: 'prose' },
    // Seeds have to start well below the band's top or there is no room to add
    // habits before the document is simply noise.
    maxFindings: { type: 'string', default: '22' },
    minWords: { type: 'string', default: '150' },
    limit: { type: 'string', default: '0' },
    chunk: { type: 'string', default: '40' },
  },
});

const config = loadConfig();
const seen = new Set<string>();
const docs: string[] = [];
for (const line of readFileSync(path.join(runsDir, `${values.in as string}.jsonl`), 'utf8').split('\n')) {
  if (line.trim() === '') continue;
  const source = (JSON.parse(line) as { source: string }).source;
  const key = source.slice(0, 200);
  if (seen.has(key)) continue;
  seen.add(key);
  docs.push(source);
}

const system = readFileSync(values.prompt as string, 'utf8');
const out: string[] = [];
const chunk = Number(values.chunk);
const maxFindings = Number(values.maxFindings);
const minWords = Number(values.minWords);
const limit = Number(values.limit);
let tooDirty = 0;
let wrongDomain = 0;

for (let i = 0; i < docs.length && (limit === 0 || out.length < limit); i += chunk) {
  const batch = docs.slice(i, i + chunk);
  const texts = new Map<string, string>();
  batch.forEach((s, j) => texts.set(`s-${i + j}`, s));
  const found = await lintTexts(texts, config);
  batch.forEach((s, j) => {
    if (limit > 0 && out.length >= limit) return;
    if (s.split(/\s+/).filter(Boolean).length < minWords) return;
    const w = weighFindings(found.get(`s-${i + j}`) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules);
    const t = scoreRewrite({ source: s, output: s, sourceFindings: w, outputFindings: w, config: config.reward });
    if (t.domain !== values.domain) {
      wrongDomain += 1;
      return;
    }
    if (t.sourceFindingsPer1kWords > maxFindings) {
      tooDirty += 1;
      return;
    }
    out.push(
      JSON.stringify({
        id: `c-${out.length}`,
        source: s,
        prompt: [
          { role: 'system', content: system },
          { role: 'user', content: `Rewrite this:\n\n${s}` },
        ],
      }),
    );
  });
}

const file = path.join(runsDir, `${values.out as string}.jsonl`);
writeFileSync(file, `${out.join('\n')}\n`);
console.log(`wrote ${out.length} ${values.domain} seeds to ${file} (${tooDirty} already too dirty, ${wrongDomain} wrong domain)`);
