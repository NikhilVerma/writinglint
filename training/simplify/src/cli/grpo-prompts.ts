import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir, simplifyRoot } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';
import { readJsonl } from '../lib/store.ts';

// Builds the GRPO prompt set. GRPO learns from a reward on its own rollouts,
// so it needs prompts and sources only — the human targets go unused here.
//
//   npx tsx src/cli/grpo-prompts.ts --from runs/human-pairs-export/train.jsonl \
//     --self runs/drift-v9/passes.jsonl --self-share 0.25
//
// --self mixes in the model's own first-pass outputs as prompts. Every other
// prompt here is slop, so the run only ever practises the big first cut and is
// never once asked to leave finished text alone — which is why re-pasting a
// simplified paragraph still moved 11% of its words. A rollout on its own
// output is the only place the fixed point gets rewarded.
//
// Extra documents can be mixed in with repeated --docs <dir> flags. The
// corpus is six essay bloggers writing flowing prose, and the adapter copies
// whenever it meets anything else, so pointing this at release notes,
// READMEs, and pull-request descriptions is what widens the distribution.

const { values } = parseArgs({
  options: {
    from: { type: 'string', multiple: true, default: [] },
    /** An existing prompt file to re-filter, read for its `source` fields.
     * Rebuilding a set from the original corpora re-derives every exclusion
     * and share along the way; this keeps a known-good composition and only
     * changes the filter under test. */
    'from-prompts': { type: 'string', multiple: true, default: [] },
    docs: { type: 'string', multiple: true, default: [] },
    out: { type: 'string', default: path.join(runsDir, 'grpo', 'prompts.jsonl') },
    self: { type: 'string', multiple: true, default: [] },
    'self-share': { type: 'string', default: '0.25' },
    'max-words': { type: 'string', default: '2200' },
    'min-words': { type: 'string', default: '120' },
    /** Must match the prompt the adapter was fine-tuned under. It was pinned to
     * v2 while training moved to v3, which would have had the reward run score
     * rollouts produced under instructions the policy never saw in SFT. */
    system: { type: 'string', default: 'prompts/rewrite-sft-v3.md' },
    /** Benchmark inputs to keep out of the prompt set, as drift-input jsonl.
     * Every document here is scored in the eval, and a reward run that has
     * practised on them reports a number about its own training set. */
    exclude: { type: 'string', multiple: true, default: [] },
    /** Share of the set allowed to be sources that already sit inside their
     * human band. Those documents have no headroom: the correct answer is to
     * return them unchanged, which the reward pays about 0.80 for while a
     * genuine attempt on a dirty document pays 0.184. At 40% of the set they
     * were the highest-paying strategy available, and fifty steps of GRPO
     * learned exactly that — technical echo rose to 0.975 and the cut halved.
     * Keep a few so the model does not forget to leave good writing alone. */
    'in-band-share': { type: 'string', default: '0.15' },
  },
});

const maxWords = Number(values['max-words']);
const minWords = Number(values['min-words']);
const config = loadConfig();
const system = readFileSync(path.join(simplifyRoot, values.system as string), 'utf8').trim();

const userPrefix = 'Simplify this:';
const wordCount = (text: string) => text.split(/\s+/).filter((w) => w !== '').length;

const sources: string[] = [];

for (const file of values['from-prompts'] as string[]) {
  for (const row of readJsonl<{ source?: string }>(file)) {
    if (row.source) sources.push(row.source);
  }
}

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

// Model outputs, read from a drift pass file. Index 1, not 0: drift_modal.py
// seeds its history with the source, so passes[0] is the slop that went in and
// passes[1] is the first rewrite — the text a user actually pastes back.
const selfSources: string[] = [];
for (const file of values.self as string[]) {
  for (const row of readJsonl<{ passes?: string[]; text?: string; output?: string }>(file)) {
    const text = (row.passes?.[1] ?? row.text ?? row.output ?? '').trim();
    if (text !== '') selfSources.push(text);
  }
}

// Benchmark documents, keyed on their first 400 characters with whitespace
// collapsed, so a document still matches after a trailing newline or a reflowed
// paragraph moves. Exact equality is too brittle for text that has been through
// a jsonl round trip.
const fingerprint = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 400);
const banned = new Set<string>();
for (const file of values.exclude as string[]) {
  for (const row of readJsonl<{ input?: string; passes?: string[] }>(file)) {
    const text = row.input ?? row.passes?.[0];
    if (text) banned.add(fingerprint(text));
  }
}
console.error(`excluding ${banned.size} benchmark documents`);

const seen = new Set<string>();
let benchDropped = 0;
const usable = (text: string) => {
  const words = wordCount(text);
  if (words < minWords || words > maxWords) return false;
  if (banned.has(fingerprint(text))) { benchDropped += 1; return false; }
  if (seen.has(text)) return false;
  seen.add(text);
  return true;
};
const slop = sources.filter(usable);
const selfKept = selfSources.filter(usable);
console.error(`dropped ${benchDropped} prompts that appear in the benchmark`);

// Held to a share of the final set rather than taken whole. Self-prompts teach
// stability, and stability is cheap to satisfy by copying, so a run made mostly
// of them would drift toward a model that never edits anything.
const selfShare = Number(values['self-share']);
const selfWanted = Math.min(selfKept.length, Math.round((selfShare * slop.length) / (1 - selfShare)));
const withSelf = [...slop, ...selfKept.slice(0, selfWanted)];

// Split by headroom. A source already inside its band cannot teach cleaning.
const inBandShare = Number(values['in-band-share']);
const hasHeadroom: string[] = [];
const inBand: string[] = [];
for (let start = 0; start < withSelf.length; start += 60) {
  const batch = withSelf.slice(start, start + 60);
  const texts = new Map<string, string>();
  batch.forEach((text, i) => texts.set(`s-${start + i}`, text));
  const findings = await lintTexts(texts, config);
  batch.forEach((text, i) => {
    const weighed = weighFindings(
      findings.get(`s-${start + i}`) ?? [],
      config.reward.levelWeights,
      config.reward.scoredRules,
    );
    const terms = scoreRewrite({
      source: text,
      output: text,
      sourceFindings: weighed,
      outputFindings: weighed,
      config: config.reward,
    });
    const [, bandHigh] = config.reward.domains[terms.domain].band;
    (terms.sourceFindingsPer1kWords > bandHigh ? hasHeadroom : inBand).push(text);
  });
}
const inBandWanted = Math.min(
  inBand.length,
  Math.round((inBandShare * hasHeadroom.length) / (1 - inBandShare)),
);
console.error(
  `headroom: ${hasHeadroom.length} above band, ${inBand.length} already in band, keeping ${inBandWanted} of the latter`,
);
const kept = [...hasHeadroom, ...inBand.slice(0, inBandWanted)];

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

const dropped = sources.length + selfSources.length - kept.length;
console.log(`wrote ${kept.length} prompts to ${outPath} (${slop.length} slop, ${selfWanted} self; dropped ${dropped} outside ${minWords}-${maxWords} words, duplicated, or over the self share)`);
console.log(`rulepacks: ${config.rulepacks.join(', ')}; reward weights: ${JSON.stringify(config.reward.weights)}`);
