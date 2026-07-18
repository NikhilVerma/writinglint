import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadParser } from 'writinglint-parser-node';
import type { ParsedSentence } from 'writinglint-core';

interface Seed { family: string; text: string }
interface Sensitive { text: string; tokenId: number }

const root = resolve('experiments/rule-sensitivity/out');
const seeds = (await readFile(resolve(root, 'seeds.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as Seed);
const entries = (await readFile(resolve(root, 'pilot.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as Sensitive);
const critical = new Map<string, Set<number>>();
for (const entry of entries) {
  const ids = critical.get(entry.text) ?? new Set<number>();
  ids.add(entry.tokenId);
  critical.set(entry.text, ids);
}

const sensitiveSeeds = seeds.filter((seed) => critical.has(seed.text));
const rank = (seed: Seed) => createHash('sha256').update(`${seed.family}\0${seed.text}`).digest('hex');
sensitiveSeeds.sort((a, b) => rank(a).localeCompare(rank(b)));
const heldOut = sensitiveSeeds.slice(0, 80);
const training = sensitiveSeeds.slice(80);
const familyHeldOutNames = new Set([
  'light-verb/expanded', 'throat-clearing/expanded', 'copula-avoidance/expanded',
  'participial/expanded', 'vague-attribution/expanded-bare',
  'vague-attribution/expanded-specific', 'rule-of-three/expanded',
  'rule-of-three/expanded-pair', 'corrective-antithesis/expanded',
  'negative-parallelism/expanded', 'stop-slop/false-agency', 'stop-slop/passive',
]);
const familyHeldOut = sensitiveSeeds.filter((seed) => familyHeldOutNames.has(seed.family));
const familyTraining = sensitiveSeeds.filter((seed) => !familyHeldOutNames.has(seed.family));
const parser = await loadParser();

function clean(value: string): string {
  return value.replace(/[\t\r\n]/g, ' ');
}

function conllu(seed: Seed, parsed: ParsedSentence, index: number): string {
  const ids = critical.get(seed.text)!;
  const lines = [
    `# sent_id = sensitivity-${String(index).padStart(5, '0')}`,
    `# family = ${seed.family}`,
    `# text = ${clean(seed.text)}`,
  ];
  for (const token of parsed.tokens) {
    const misc = `RuleWeight=${ids.has(token.id) ? '4' : '1'}`;
    lines.push([
      token.id, clean(token.form), clean(token.lemma ?? token.form.toLowerCase()), token.upos,
      '_', '_', token.head, token.deprel, '_', misc,
    ].join('\t'));
  }
  return `${lines.join('\n')}\n`;
}

async function render(items: Seed[], offset: number): Promise<string> {
  const blocks: string[] = [];
  for (let index = 0; index < items.length; index++) {
    const parsed = await parser.parse(items[index]!.text);
    if (parsed.length === 1) blocks.push(conllu(items[index]!, parsed[0]!, offset + index));
  }
  return blocks.join('\n');
}

const output = resolve(root, 'training');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'heldout.conllu'), await render(heldOut, 0));
for (const size of [50, 100, 250]) {
  await writeFile(resolve(output, `train-${size}.conllu`), await render(training.slice(0, size), 1000));
}
await writeFile(resolve(output, 'family-heldout.conllu'), await render(familyHeldOut, 5000));
for (const size of [25, 50, 80]) {
  await writeFile(
    resolve(output, `family-train-${size}.conllu`),
    await render(familyTraining.slice(0, size), 6000),
  );
}
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({
  sensitiveSeeds: sensitiveSeeds.length,
  heldOut: heldOut.length,
  availableTraining: training.length,
  sizes: [50, 100, 250],
  split: 'sha256(family + NUL + text)',
  familyHeldOut: familyHeldOut.length,
  familyTraining: familyTraining.length,
  familySizes: [25, 50, 80],
  familyHeldOutNames: [...familyHeldOutNames].sort(),
}, null, 2) + '\n');
console.log(JSON.stringify({
  sensitiveSeeds: sensitiveSeeds.length, heldOut: heldOut.length,
  availableTraining: training.length, familyHeldOut: familyHeldOut.length,
  familyTraining: familyTraining.length,
}, null, 2));
