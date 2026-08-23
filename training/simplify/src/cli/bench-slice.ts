// Writes the benchmark's dirty-prose documents out as files, for a probe that
// needs to hand real documents to something outside this pipeline.
//
//   npx tsx src/cli/bench-slice.ts --arm qwen8 --slice prose-dirty --n 12 --out <dir>
//
// These are BENCHMARK inputs. They may be measured against, and must never
// become training data — a model trained on them reports a number about its
// own training set.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';
import { readFileSync } from 'node:fs';

const { values } = parseArgs({
  options: {
    arm: { type: 'string', default: 'qwen8' },
    slice: { type: 'string', default: 'prose-dirty' },
    n: { type: 'string', default: '12' },
    out: { type: 'string', default: '' },
    'max-words': { type: 'string', default: '1400' },
  },
});

const config = loadConfig();
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const rows = readFileSync(path.join(runsDir, `drift-${values.arm}.jsonl`), 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as { id: string; passes: string[] });

const picked: { id: string; text: string; per1k: number }[] = [];
const seen = new Set<string>();
for (let i = 0; i < rows.length; i += 40) {
  const batch = rows.slice(i, i + 40);
  const texts = new Map<string, string>();
  batch.forEach((r, j) => texts.set(`s-${i + j}`, r.passes[0] ?? ''));
  const f = await lintTexts(texts, config);
  batch.forEach((r, j) => {
    const src = r.passes[0] ?? '';
    if (words(src) === 0 || words(src) > Number(values['max-words'])) return;
    const doc = r.id.split('#')[0];
    if (seen.has(doc)) return;
    const w = weighFindings(f.get(`s-${i + j}`) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules);
    const t = scoreRewrite({ source: src, output: src, sourceFindings: w, outputFindings: w, config: config.reward });
    const [, bandHigh] = config.reward.domains[t.domain].band;
    if (`${t.domain}-${t.sourceFindingsPer1kWords > bandHigh ? 'dirty' : 'clean'}` !== values.slice) return;
    seen.add(doc);
    picked.push({ id: r.id, text: src, per1k: t.sourceFindingsPer1kWords });
  });
}

// Sorted by dirtiness so a small probe covers the range it is meant to test,
// rather than whichever documents happen to come first in the file.
picked.sort((a, b) => b.per1k - a.per1k);
const step = Math.max(1, Math.floor(picked.length / Number(values.n)));
const spread = picked.filter((_, i) => i % step === 0).slice(0, Number(values.n));

const outDir = values.out as string;
mkdirSync(outDir, { recursive: true });
spread.forEach((p, i) => {
  writeFileSync(path.join(outDir, `doc-${String(i).padStart(2, '0')}.md`), p.text, 'utf8');
});
writeFileSync(
  path.join(outDir, 'index.json'),
  JSON.stringify(spread.map((p, i) => ({ file: `doc-${String(i).padStart(2, '0')}.md`, id: p.id, per1k: Math.round(p.per1k * 10) / 10, words: words(p.text) })), null, 2),
  'utf8',
);
console.log(`wrote ${spread.length} of ${picked.length} ${values.slice} documents to ${outDir}`);
console.log(spread.map((p) => `${p.per1k.toFixed(1)}/1k  ${words(p.text)}w  ${p.id}`).join('\n'));
