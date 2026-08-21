import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { FileStorage, createEngine } from '@nikhilverma/durably';

import { durablyDir, loadConfig } from '../lib/env.ts';
import { totalSpentUsd } from '../lib/openrouter.ts';
import { sha256 } from '../lib/store.ts';
import {
  essayDir,
  essayPath,
  extractMonthYearDate,
  fetchPosts,
  humanPairsDir,
  rewritePath,
  rewritePosts,
  rewritesRoot,
  sourcesConfigPath,
  essaysRoot,
  lengthRatio,
  withinLengthBand,
  type HumanSource,
  type RewritePair,
} from '../workflows/human-pairs.ts';

// Builds the PRIVATE human-vs-AI paired corpus (gitignored, local only).
// Human side: pre-AI-era posts by renowned authors, listed in
// corpus/human-pairs/sources.json (kept inside the corpus dir on purpose —
// the source list is part of the private dataset).
//   tsx human-pairs.ts fetch [--source id] [--limit N]
//   tsx human-pairs.ts rewrite --models a,b,c [--source id] [--limit N]
//     [--cutoff 2022-11-01] [--min-words 250] [--max-words 4000]
//     [--concurrency 3] [--max-tokens 12000]
//   tsx human-pairs.ts audit [--min-ratio 0.7] [--max-ratio 1.3]
//   tsx human-pairs.ts status [--cutoff 2022-11-01]
// Fetch and rewrite skip files that already exist, so re-running resumes.

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: 'string' },
    limit: { type: 'string', default: '0' },
    models: { type: 'string' },
    // Default cutoff sits just before the ChatGPT launch (2022-11-30): a
    // renowned author's post from before it is human-written by construction.
    cutoff: { type: 'string', default: '2022-11-01' },
    'min-words': { type: 'string', default: '250' },
    'max-words': { type: 'string', default: '4000' },
    'max-tokens': { type: 'string', default: '12000' },
    concurrency: { type: 'string', default: '3' },
    // Keeps any one author from dominating the corpus. The cap picks a
    // stable pseudo-random sample (sorted by content hash), so re-runs
    // select the same posts.
    'cap-per-source': { type: 'string', default: '250' },
    // Length rubric band for `audit` and training export: rewrites whose
    // word count falls outside [min, max] × original are rejected.
    'min-ratio': { type: 'string', default: '0.7' },
    'max-ratio': { type: 'string', default: '1.3' },
  },
});

const command = positionals[0];
const config = loadConfig();
const limit = Number(values.limit);
const cutoff = values.cutoff as string;

function loadSources(): HumanSource[] {
  if (!existsSync(sourcesConfigPath)) {
    console.error(`missing ${sourcesConfigPath}; create it first (see workflows/human-pairs.ts for the shape)`);
    process.exit(2);
  }
  const sources = JSON.parse(readFileSync(sourcesConfigPath, 'utf8')) as HumanSource[];
  return values.source ? sources.filter((s) => s.id === values.source) : sources;
}

const engine = createEngine({
  storage: new FileStorage(durablyDir),
  concurrency: 2,
  checkpointEvery: 1,
}) as ReturnType<typeof createEngine> & {
  runDirectFast: (wf: unknown, input: unknown, opts: object) => Promise<unknown>;
};

interface EssayMeta {
  slug: string;
  sourceId?: string;
  title: string;
  words: number;
  publishedAt?: string | null;
}

function localPosts(sourceId: string): EssayMeta[] {
  const dir = essayDir(sourceId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(path.join(dir, name), 'utf8')) as EssayMeta)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Older metas predate the publishedAt field; derive it from the text once. */
function backfillDates(source: HumanSource): number {
  if (source.kind !== 'paulgraham') return 0;
  let updated = 0;
  for (const meta of localPosts(source.id)) {
    if (meta.publishedAt !== undefined) continue;
    const text = readFileSync(essayPath(source.id, meta.slug), 'utf8');
    const publishedAt = extractMonthYearDate(text);
    const metaPath = path.join(essayDir(source.id), `${meta.slug}.json`);
    const full = JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(metaPath, `${JSON.stringify({ ...full, sourceId: source.id, publishedAt }, null, 2)}\n`, 'utf8');
    updated += 1;
  }
  return updated;
}

function eligible(source: HumanSource): EssayMeta[] {
  const minWords = Number(values['min-words']);
  const maxWords = Number(values['max-words']);
  return localPosts(source.id).filter(
    (meta) =>
      typeof meta.publishedAt === 'string' &&
      meta.publishedAt < cutoff &&
      meta.words >= minWords &&
      meta.words <= maxWords,
  );
}

function capped(source: HumanSource): EssayMeta[] {
  const cap = Number(values['cap-per-source']);
  const posts = eligible(source);
  if (cap <= 0 || posts.length <= cap) return posts;
  return posts
    .map((meta) => ({ meta, rank: sha256(`${source.id}/${meta.slug}`) }))
    .sort((a, b) => a.rank.localeCompare(b.rank))
    .slice(0, cap)
    .map((entry) => entry.meta);
}

if (command === 'fetch') {
  for (const source of loadSources()) {
    const input = { source, limit };
    const key = `hp-fetch-${source.id}-${sha256(JSON.stringify(input)).slice(0, 8)}`;
    const result = await engine.runDirectFast(fetchPosts, input, { key });
    const backfilled = backfillDates(source);
    console.log(`${source.id}:`, JSON.stringify(result), backfilled > 0 ? `(backfilled ${backfilled} dates)` : '');
  }
  console.log(`corpus dir: ${humanPairsDir}`);
} else if (command === 'rewrite') {
  if (!values.models) {
    console.error('rewrite needs --models model1,model2,model3');
    process.exit(2);
  }
  const models = (values.models as string).split(',').map((m) => m.trim()).filter((m) => m !== '');
  const pairs: RewritePair[] = [];
  for (const source of loadSources()) {
    let posts = capped(source);
    if (limit > 0) {
      // Prefer posts still missing a requested model, so successive
      // --limit pilots extend coverage instead of re-selecting done slugs.
      posts = posts
        .filter((meta) => models.some((model) => !existsSync(rewritePath(source.id, meta.slug, model))))
        .slice(0, limit);
    }
    for (const meta of posts) for (const model of models) pairs.push({ sourceId: source.id, slug: meta.slug, model });
  }
  if (pairs.length === 0) {
    console.log('nothing to rewrite (no eligible posts, or all done)');
    process.exit(0);
  }
  console.log(`rewriting ${pairs.length} (post, model) pairs; cutoff ${cutoff}`);
  console.log(`ledger: $${totalSpentUsd().toFixed(4)} of $${config.capUsd}`);
  const input = { pairs, maxTokens: Number(values['max-tokens']), concurrency: Number(values.concurrency) };
  const key = `hp-rewrite-${sha256(JSON.stringify(input)).slice(0, 8)}`;
  const result = await engine.runDirectFast(rewritePosts, input, { key });
  console.log('rewrite result:', JSON.stringify(result));
  console.log(`ledger after: $${totalSpentUsd().toFixed(4)}`);
} else if (command === 'audit') {
  // Length rubric over every fetched rewrite: a pair trains the model to
  // rewrite, not summarize or pad, so the rewrite must keep roughly the
  // original's length. Truncated responses are rejected outright.
  const minRatio = Number(values['min-ratio']);
  const maxRatio = Number(values['max-ratio']);
  interface RewriteMeta {
    sourceId: string;
    slug: string;
    model: string;
    words: number;
    sourceWords: number;
    truncated?: boolean;
  }
  const byModel = new Map<string, { total: number; short: number; long: number; truncated: number; ratios: number[] }>();
  const offenders: { path: string; ratio: number }[] = [];
  for (const source of loadSources()) {
    const dir = path.join(rewritesRoot, source.id);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const meta = JSON.parse(readFileSync(path.join(dir, name), 'utf8')) as RewriteMeta;
      const entry = byModel.get(meta.model) ?? { total: 0, short: 0, long: 0, truncated: 0, ratios: [] };
      const ratio = lengthRatio(meta.sourceWords, meta.words);
      entry.total += 1;
      entry.ratios.push(ratio);
      if (meta.truncated) entry.truncated += 1;
      if (!withinLengthBand(meta.sourceWords, meta.words, minRatio, maxRatio) || meta.truncated) {
        if (ratio < minRatio) entry.short += 1;
        else if (ratio > maxRatio) entry.long += 1;
        offenders.push({ path: path.join(dir, name.replace(/\.json$/, '.md')), ratio });
      }
      byModel.set(meta.model, entry);
    }
  }
  let total = 0;
  let rejected = 0;
  for (const [model, entry] of [...byModel.entries()].sort()) {
    const sorted = [...entry.ratios].sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const bad = entry.short + entry.long + entry.truncated;
    total += entry.total;
    rejected += bad;
    console.log(
      `${model}: ${entry.total} rewrites, median ratio ${median.toFixed(2)}, ` +
        `${bad} rejected (${entry.short} short, ${entry.long} long, ${entry.truncated} truncated)`,
    );
  }
  offenders.sort((a, b) => Math.abs(Math.log(b.ratio || 0.01)) - Math.abs(Math.log(a.ratio || 0.01)));
  for (const worst of offenders.slice(0, 10)) {
    console.log(`  worst: ratio ${worst.ratio.toFixed(2)} ${worst.path}`);
  }
  console.log(`band [${minRatio}, ${maxRatio}]: ${total - rejected}/${total} pairs usable, ${rejected} rejected`);
} else if (command === 'status') {
  let totalPosts = 0;
  let totalEligible = 0;
  for (const source of loadSources()) {
    const posts = localPosts(source.id);
    const ok = eligible(source);
    const take = capped(source);
    const rewriteDir = path.join(rewritesRoot, source.id);
    const rewrites = existsSync(rewriteDir) ? readdirSync(rewriteDir).filter((n) => n.endsWith('.md')).length : 0;
    totalPosts += posts.length;
    totalEligible += take.length;
    console.log(
      `${source.id}: ${posts.length} posts, ${ok.length} eligible (< ${cutoff}, ${values['min-words']}-${values['max-words']} words), ${take.length} after cap, ${rewrites} rewrites`,
    );
  }
  console.log(`total: ${totalPosts} posts, ${totalEligible} eligible`);
  console.log(`essays root: ${essaysRoot}`);
  console.log(`ledger: $${totalSpentUsd().toFixed(4)} of $${config.capUsd}`);
} else {
  console.error('usage: tsx human-pairs.ts <fetch|rewrite|audit|status> [options]');
  process.exit(2);
}
