// Turns n samples per document into one training pair, or none.
//
//   npx tsx src/cli/best-of-n.ts --in samples-8b --out train/data/v14/train.jsonl
//
// Selection is by findings REMOVED, not by reward. Reward pays about 0.8 for
// handing a clean document back untouched, so ranking eight samples by reward
// picks the laziest one and teaches the student to copy — which is exactly what
// the v12 data did to a 1.7B. Ranking by what was actually cleaned cannot be
// satisfied by copying: a copy cuts zero and is rejected outright.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';
import { normalizeOutput } from '../lib/text.ts';

const { values } = parseArgs({
  options: {
    in: { type: 'string', default: 'samples-8b' },
    out: { type: 'string', default: 'train/data/v14/train.jsonl' },
    system: { type: 'string', default: 'prompts/rewrite-sft-v3.md' },
    'min-cut': { type: 'string', default: '3' },
    'min-faith': { type: 'string', default: '0.9' },
    'max-echo': { type: 'string', default: '0.9' },
    // Any training source that is a near-copy of a benchmark document is
    // dropped. Exact hashing says these sets do not overlap; 8-gram Jaccard
    // says six of the first 800 sources ARE benchmark documents wearing
    // different whitespace, and one matches at 0.97.
    exclude: { type: 'string', default: 'drift-inputs-v11' },
    'max-overlap': { type: 'string', default: '0.3' },
    chunk: { type: 'string', default: '40' },
  },
});

const config = loadConfig();
const minCut = Number(values['min-cut']);
const minFaith = Number(values['min-faith']);
const maxEcho = Number(values['max-echo']);

const rows = readFileSync(path.join(runsDir, `${values.in}.jsonl`), 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as { source: string; outputs: string[] });

/** 8-gram set of a document, for near-duplicate detection. */
function shingles(text: string, k = 8): Set<string> {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + k <= words.length; i += 1) out.add(words.slice(i, i + k).join(' '));
  return out;
}

const maxOverlap = Number(values['max-overlap']);
// One inverted index over the benchmark, so the check is a lookup per shingle
// rather than a comparison against every benchmark document.
const evalIndex = new Map<string, Set<number>>();
const evalSizes: number[] = [];
if (values.exclude !== '') {
  const evalRows = readFileSync(path.join(runsDir, `${values.exclude}.jsonl`), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  evalRows.forEach((row, i) => {
    const text = (row.text ?? row.source ?? row.input ?? '') as string;
    const grams = shingles(text);
    evalSizes.push(grams.size);
    for (const g of grams) {
      let bucket = evalIndex.get(g);
      if (bucket === undefined) evalIndex.set(g, (bucket = new Set()));
      bucket.add(i);
    }
  });
}

/** Highest Jaccard overlap between this source and any benchmark document. */
function benchmarkOverlap(source: string): number {
  if (evalIndex.size === 0) return 0;
  const grams = shingles(source);
  const shared = new Map<number, number>();
  for (const g of grams) {
    for (const i of evalIndex.get(g) ?? []) shared.set(i, (shared.get(i) ?? 0) + 1);
  }
  let worst = 0;
  for (const [i, n] of shared) {
    const union = grams.size + evalSizes[i] - n;
    if (union > 0 && n / union > worst) worst = n / union;
  }
  return worst;
}

const system = readFileSync(values.system as string, 'utf8').trim();
const kept: string[] = [];
const cuts: number[] = [];
let rejected = 0;
let contaminated = 0;
// Why a sample was thrown away. A document rejected because nothing was left to
// cut is a healthy filter; a document rejected because the model kept dropping
// facts is a problem with the model, and the two must not look alike in the log.
const why = { degenerate: 0, faith: 0, echo: 0, cut: 0 };

for (let start = 0; start < rows.length; start += Number(values.chunk)) {
  const batch = rows
    .slice(start, start + Number(values.chunk))
    .filter((r) => {
      if (benchmarkOverlap(r.source) < maxOverlap) return true;
      contaminated += 1;
      return false;
    });
  if (batch.length === 0) continue;
  const texts = new Map<string, string>();
  batch.forEach((r, i) => {
    texts.set(`s-${start + i}`, r.source);
    r.outputs.forEach((o, j) => {
      const clean = normalizeOutput(o);
      if (clean.trim() !== '') texts.set(`o-${start + i}-${j}`, clean);
    });
  });
  const findings = await lintTexts(texts, config);
  const weigh = (key: string) =>
    weighFindings(findings.get(key) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules);

  batch.forEach((r, i) => {
    let best: { text: string; cut: number } | null = null;
    r.outputs.forEach((o, j) => {
      const clean = normalizeOutput(o);
      if (!texts.has(`o-${start + i}-${j}`)) return;
      const terms = scoreRewrite({
        source: r.source,
        output: clean,
        sourceFindings: weigh(`s-${start + i}`),
        outputFindings: weigh(`o-${start + i}-${j}`),
        config: config.reward,
      });
      const cut = terms.sourceFindingsPer1kWords - terms.findingsPer1kWords;
      // A sample that invents, drops facts, or barely changed the source is not
      // a target however much it cut.
      if (terms.degenerate) {
        why.degenerate += 1;
        return;
      }
      if (terms.anchorKeptRate < minFaith) {
        why.faith += 1;
        return;
      }
      if (terms.echoRate > maxEcho) {
        why.echo += 1;
        return;
      }
      if (cut < minCut) {
        why.cut += 1;
        return;
      }
      if (best === null || cut > best.cut) best = { text: clean, cut };
    });
    if (best === null) {
      rejected += 1;
      return;
    }
    cuts.push(best.cut);
    kept.push(
      JSON.stringify({
        kind: 'best-of-n',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Simplify this:\n\n${r.source}` },
          { role: 'assistant', content: best.text },
        ],
      }),
    );
  });
  console.error(`[best-of-n] ${Math.min(start + Number(values.chunk), rows.length)}/${rows.length} kept ${kept.length}`);
}

mkdirSync(path.dirname(values.out as string), { recursive: true });
writeFileSync(values.out as string, kept.map((l) => `${l}\n`).join(''), 'utf8');
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
console.log(
  `wrote ${kept.length} pairs to ${values.out} (${rejected} documents produced no usable sample, ` +
    `${contaminated} dropped as near-duplicates of the benchmark)\n` +
    `mean cut of the kept samples ${mean(cuts).toFixed(1)} weighted findings per 1k\n` +
    `samples thrown away: ${why.cut} cut too little, ${why.faith} dropped facts, ` +
    `${why.echo} barely changed the source, ${why.degenerate} degenerate`,
);
