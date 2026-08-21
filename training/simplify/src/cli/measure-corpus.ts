/**
 * Compare two directories of the same documents and report what the linter
 * sees in each.
 *
 * The corrupted corpus exists to reach rules that natural prose never trips,
 * so the number that matters is rule coverage, not density. Labels come from
 * here and never from whatever the generator claims it did.
 *
 *   npx tsx src/cli/measure-corpus.ts <source-dir> <output-dir> [--json report.json]
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Linter, resolveConfig, type Lint } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { aiStyle } from 'writinglint-rulepack-ai-style';
import { readerFirst } from 'writinglint-rulepack-reader-first';
// Reached across the tree on purpose. The published `slopsift` does not export
// this, and going through the installed CLI would measure whatever version is
// on the machine rather than the working tree.
import { profileFor } from '../../../../packages/slopsift/src/profiles.ts';

const [sourceDir, outputDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!sourceDir || !outputDir) throw new Error('usage: measure-corpus <source-dir> <output-dir> [--json path]');
const jsonFlag = process.argv.indexOf('--json');
const jsonPath = jsonFlag > -1 ? process.argv[jsonFlag + 1] : null;

const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;
const RULEPACKS = ['ai-style', 'reader-first'] as const;
const linter = new Linter(await loadParser());
// The same two profiles the reward path uses. `recommended` is what the CLI
// runs and therefore what a rollout is actually paid on; `strict` drops the
// severity floor to `info`, so a rule that only ever whispers is not mistaken
// for a dead one.
const paidConfig = resolveConfig(profileFor('prose', 'recommended', RULEPACKS));
const infoConfig = resolveConfig(profileFor('prose', 'strict', RULEPACKS));
const allRules = [
  ...Object.values(aiStyle.rules).map((r: any) => `ai-style/${r.meta.name}`),
  ...Object.values(readerFirst.rules).map((r: any) => `reader-first/${r.meta.name}`),
];

interface Side { docs: number; words: number; paid: number; info: number; rules: Map<string, number>; anyRules: Map<string, number>; }
const blank = (): Side => ({ docs: 0, words: 0, paid: 0, info: 0, rules: new Map(), anyRules: new Map() });
const sides = { source: blank(), output: blank() };
const perDoc: { id: string; srcPer1k: number; outPer1k: number; lengthRatio: number }[] = [];

const names = readdirSync(outputDir).filter((f) => f.endsWith('.md')).sort();
for (const name of names) {
  const src = readFileSync(join(sourceDir, name), 'utf8');
  const out = readFileSync(join(outputDir, name), 'utf8');
  const measured: Record<string, number> = {};
  // Passing the same directory twice is how a single corpus gets measured on
  // its own. Linting it a second time would double the work for nothing.
  const pairs = sourceDir === outputDir ? ([['source', src]] as const) : ([['source', src], ['output', out]] as const);
  for (const [label, text] of pairs) {
    const lints: Lint[] = (await linter.lint(text, paidConfig)).lints;
    const all: Lint[] = (await linter.lint(text, infoConfig)).lints;
    const side = sides[label];
    side.docs += 1;
    side.words += words(text);
    side.paid += lints.length;
    side.info += Math.max(0, all.length - lints.length);
    for (const l of lints) side.rules.set(l.ruleId, (side.rules.get(l.ruleId) ?? 0) + 1);
    for (const l of all) side.anyRules.set(l.ruleId, (side.anyRules.get(l.ruleId) ?? 0) + 1);
    measured[label] = (lints.length * 1000) / Math.max(1, words(text));
  }
  perDoc.push({
    id: name,
    srcPer1k: measured.source,
    outPer1k: measured.output,
    lengthRatio: words(out) / Math.max(1, words(src)),
  });
}

const per1k = (s: Side) => (s.paid * 1000) / Math.max(1, s.words);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

for (const [label, s] of Object.entries(sides).filter(([, v]) => v.docs > 0)) {
  console.log(
    `${label.padEnd(6)} ${s.docs} docs, ${s.words} words, ${s.paid} paid findings ` +
      `(${per1k(s).toFixed(1)}/1k), ${s.info} info, ${s.rules.size}/${allRules.length} rules paid, ` +
      `${s.anyRules.size}/${allRules.length} including info`,
  );
}
console.log(`median length ratio ${median(perDoc.map((d) => d.lengthRatio)).toFixed(2)}x`);

const woke = [...sides.output.rules.keys()].filter((r) => !sides.source.rules.has(r)).sort();
const dark = allRules.filter((r) => !sides.output.rules.has(r)).sort();
console.log(`\nwoke up (${woke.length}):`);
for (const r of woke) console.log(`  ${r}  ${sides.output.rules.get(r)}`);
console.log(`\nstill dark (${dark.length}): ${dark.join(', ')}`);

if (jsonPath) {
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        source: { ...sides.source, rules: Object.fromEntries(sides.source.rules), anyRules: Object.fromEntries(sides.source.anyRules) },
        output: { ...sides.output, rules: Object.fromEntries(sides.output.rules), anyRules: Object.fromEntries(sides.output.anyRules) },
        woke,
        dark,
        perDoc,
      },
      null,
      1,
    ),
  );
  console.log(`\nwrote ${jsonPath}`);
}
