import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir, simplifyRoot } from '../lib/env.ts';
import { readJsonl } from '../lib/store.ts';

// Builds the GRPO prompt set. GRPO learns from a reward on its own rollouts,
// so it needs prompts and sources only — the human targets go unused here.
//
//   npx tsx src/cli/grpo-prompts.ts --from runs/human-pairs-export/train.jsonl
//
// Extra documents can be mixed in with repeated --docs <dir> flags. The
// corpus is six essay bloggers writing flowing prose, and the adapter copies
// whenever it meets anything else, so pointing this at release notes,
// READMEs, and pull-request descriptions is what widens the distribution.

const { values } = parseArgs({
  options: {
    from: { type: 'string', multiple: true, default: [] },
    docs: { type: 'string', multiple: true, default: [] },
    out: { type: 'string', default: path.join(runsDir, 'grpo', 'prompts.jsonl') },
    'max-words': { type: 'string', default: '2200' },
    'min-words': { type: 'string', default: '120' },
  },
});

const maxWords = Number(values['max-words']);
const minWords = Number(values['min-words']);
const config = loadConfig();
const system = readFileSync(path.join(simplifyRoot, 'prompts', 'rewrite-sft-v2.md'), 'utf8').trim();

const userPrefix = 'Simplify this:';
const wordCount = (text: string) => text.split(/\s+/).filter((w) => w !== '').length;

const sources: string[] = [];

for (const file of values.from as string[]) {
  const rows = readJsonl<{ messages: { role: string; content: string }[] }>(file);
  for (const row of rows) {
    const user = row.messages.find((m) => m.role === 'user');
    if (!user) continue;
    const text = user.content.startsWith(userPrefix) ? user.content.slice(userPrefix.length).trim() : user.content.trim();
    sources.push(text);
  }
}

for (const dir of values.docs as string[]) {
  const { readdirSync, statSync } = await import('node:fs');
  const walk = (current: string): string[] =>
    readdirSync(current).flatMap((entry) => {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return /\.(md|markdown|txt)$/i.test(entry) ? [full] : [];
    });
  for (const file of walk(dir)) sources.push(readFileSync(file, 'utf8').trim());
}

const seen = new Set<string>();
const kept = sources.filter((text) => {
  const words = wordCount(text);
  if (words < minWords || words > maxWords) return false;
  if (seen.has(text)) return false;
  seen.add(text);
  return true;
});

// Sources arrive grouped: every essay, then every technical document. Written
// in that order the trainer walks the essays for hundreds of steps and reaches
// the technical text last or never, so the copying this run exists to punish
// never appears in a batch. A seeded shuffle keeps the file reproducible.
let state = 0x9e3779b9;
const nextRandom = (): number => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0x100000000;
};
for (let i = kept.length - 1; i > 0; i -= 1) {
  const j = Math.floor(nextRandom() * (i + 1));
  [kept[i], kept[j]] = [kept[j], kept[i]];
}

const outPath = values.out as string;
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  kept
    .map((text) =>
      JSON.stringify({
        prompt: [
          { role: 'system', content: system },
          { role: 'user', content: `${userPrefix}\n\n${text}` },
        ],
        source: text,
      }),
    )
    .join('\n') + '\n',
  'utf8',
);

const dropped = sources.length - kept.length;
console.log(`wrote ${kept.length} prompts to ${outPath} (dropped ${dropped} outside ${minWords}-${maxWords} words or duplicated)`);
console.log(`rulepacks: ${config.rulepacks.join(', ')}; reward weights: ${JSON.stringify(config.reward.weights)}`);
