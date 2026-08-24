// Paired per-document comparison of two eval arms.
//
//   npx tsx src/cli/arm-diff.ts --a sft8bv15 --b qwen8 --slice prose-dirty
//
// The goal is "better than the 8B it started from", and the summary in
// clean-report cannot answer that. It reports each arm's mean over the same
// documents, but two means whose error bars overlap can still hide a real
// paired difference, and two means that look apart can be one loud document.
// Both arms rewrite the SAME source, so the difference is paired and the
// variance across documents cancels. That is the test the goal asks for.
//
// Reads passes[0] as the source and passes[1] as the first rewrite, which is
// the text a user actually gets. Later passes are rewrites of rewrites.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { faithfulness } from '../lib/faithfulness.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';

const { values } = parseArgs({
  options: {
    a: { type: 'string', default: 'sft8bv15' },
    b: { type: 'string', default: 'qwen8' },
    /** prose-dirty | prose-clean | technical-dirty | technical-clean | all */
    slice: { type: 'string', default: 'prose-dirty' },
    chunk: { type: 'string', default: '40' },
  },
});

const config = loadConfig();
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

interface Row { id: string; passes: string[] }
const read = (name: string) =>
  readFileSync(path.join(runsDir, `drift-${name}.jsonl`), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Row);

// Benchmark ids are NOT unique: `paulgraham/95#0` names three different
// documents, because the chunk index restarts for each corruption variant of
// the same essay. Keying a Map by id therefore kept one row per id and threw
// away 92 of 275 documents in silence, which cost a third of the statistical
// power of every comparison in this project. Both files are written from the
// same input list in the same order, so they zip positionally — checked
// against the source text rather than assumed.
const rowsA = read(values.a as string);
const rowsB = read(values.b as string);
if (rowsA.length !== rowsB.length) {
  throw new Error(`drift-${values.a} has ${rowsA.length} rows and drift-${values.b} has ${rowsB.length}; they cannot be zipped`);
}
rowsA.forEach((r, i) => {
  if ((r.passes[0] ?? '').trim() !== (rowsB[i].passes[0] ?? '').trim()) {
    throw new Error(`row ${i} (${r.id}) has a different source in each arm; the files are not aligned`);
  }
});
const ids = rowsA.map((_r, i) => String(i));
const A = new Map(rowsA.map((r, i) => [String(i), r]));
const B = new Map(rowsB.map((r, i) => [String(i), r]));

/** A document is "dirty" if its source sits above its own band, and
 * "technical" by the same anchor density the reward uses. Recomputed here
 * rather than trusted from a label, so the slice cannot drift from the reward. */
interface Scored { id: string; cut: number; faith: number; length: number; domain: string; dirty: boolean }
const measure = async (rows: Row[]): Promise<Map<string, Scored>> => {
  // Keyed by position for the same reason the arms are zipped by position.
  const out = new Map<string, Scored>();
  const chunk = Number(values.chunk);
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk);
    const texts = new Map<string, string>();
    batch.forEach((r, j) => {
      texts.set(`s-${i + j}`, r.passes[0] ?? '');
      texts.set(`o-${i + j}`, r.passes[1] ?? '');
    });
    const f = await lintTexts(texts, config);
    batch.forEach((r, j) => {
      const src = r.passes[0] ?? '';
      const out1 = r.passes[1] ?? '';
      if (words(src) === 0 || words(out1) === 0) return;
      const sw = weighFindings(f.get(`s-${i + j}`) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules);
      const ow = weighFindings(f.get(`o-${i + j}`) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules);
      const terms = scoreRewrite({ source: src, output: out1, sourceFindings: sw, outputFindings: ow, config: config.reward });
      const [, bandHigh] = config.reward.domains[terms.domain].band;
      out.set(String(i + j), {
        id: r.id,
        cut: (sw * 1000) / words(src) - (ow * 1000) / words(out1),
        faith: faithfulness(src, out1).keptRate,
        length: words(out1) / words(src),
        domain: terms.domain,
        dirty: terms.sourceFindingsPer1kWords > bandHigh,
      });
    });
  }
  return out;
};

const sa = await measure(ids.map((id) => A.get(id)!));
const sb = await measure(ids.map((id) => B.get(id)!));

const wanted = values.slice as string;
const inSlice = (s: Scored) =>
  wanted === 'all' || wanted === `${s.domain}-${s.dirty ? 'dirty' : 'clean'}`;

const pairs = ids
  .map((id) => ({ a: sa.get(id), b: sb.get(id) }))
  .filter((p): p is { a: Scored; b: Scored } => p.a !== undefined && p.b !== undefined)
  // Slice on arm B, the baseline. Slicing on each arm separately would compare
  // different document sets whenever a rewrite crosses the band edge.
  .filter((p) => inSlice(p.b));

/** Mean of the paired differences with a 95% interval. The interval is what
 * decides the claim: if it straddles zero the two arms are the same model on
 * this slice, however far apart their headline means look. */
function paired(get: (s: Scored) => number) {
  const d = pairs.map((p) => get(p.a) - get(p.b));
  const n = d.length;
  const mean = d.reduce((x, y) => x + y, 0) / n;
  const sd = Math.sqrt(d.reduce((acc, x) => acc + (x - mean) ** 2, 0) / Math.max(1, n - 1));
  const ci = (1.96 * sd) / Math.sqrt(n);
  const wins = d.filter((x) => x > 0).length;
  return { mean, ci, wins, n };
}

console.log(`\n${values.a} minus ${values.b}, slice ${wanted}, ${pairs.length} paired documents\n`);
for (const [label, get] of [
  ['cut (findings/1k removed)', (s: Scored) => s.cut],
  ['faithfulness', (s: Scored) => s.faith],
  ['length ratio', (s: Scored) => s.length],
] as const) {
  const r = paired(get);
  const verdict = Math.abs(r.mean) > r.ci ? (r.mean > 0 ? `${values.a} BETTER` : `${values.a} WORSE`) : 'SAME (interval spans zero)';
  console.log(
    `  ${label.padEnd(28)} ${r.mean >= 0 ? '+' : ''}${r.mean.toFixed(3)} +/-${r.ci.toFixed(3)}   ` +
      `${values.a} ahead on ${((100 * r.wins) / r.n).toFixed(0)}% of documents   ${verdict}`,
  );
}
console.log('\nA paired interval that spans zero means the two arms are the same model on this slice.');
