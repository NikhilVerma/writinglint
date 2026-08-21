import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { workflow } from '@nikhilverma/durably';

import { corpusDir, loadConfig, simplifyRoot } from '../lib/env.ts';
import { extractHtmlText, wordCount } from '../lib/html.ts';
import { chat } from '../lib/openrouter.ts';
import { sha256, writeJsonPretty } from '../lib/store.ts';
import { stripEmoji } from '../lib/text.ts';

// Human-vs-AI paired corpus: pre-AI-era posts by renowned human authors,
// plus AI models rewriting the same posts in their own words. The two sides
// then differ only in who wrote them, not in topic or structure, and the
// labels are known by construction — no detector runs over this corpus.
// PRIVATE: everything under corpusDir is gitignored and stays local. The
// source list lives inside the corpus dir for the same reason.

export const humanPairsDir = path.join(corpusDir, 'human-pairs');
export const essaysRoot = path.join(humanPairsDir, 'essays');
export const rewritesRoot = path.join(humanPairsDir, 'rewrites');
export const sourcesConfigPath = path.join(humanPairsDir, 'sources.json');

const userAgent = 'slopsift-research/0.1 (personal research corpus; contact: repo owner)';

export interface HumanSource {
  id: string;
  author: string;
  /** 'paulgraham' has bespoke list/date handling; 'listing' covers blogs
   * whose archive pages link posts with the date in the URL. */
  kind: 'paulgraham' | 'listing';
  listUrls?: string[];
  /** For archives that only link month/section pages: a regex over the
   * listUrls pages whose full matches are the real listing page URLs. */
  listPagePattern?: string;
  /** Regex over the listing HTML. All capture groups but the last are date
   * parts (year, month, optional day); the last group is the slug. */
  linkPattern?: string;
  /** Prepended to each matched link, for sites whose listings use
   * relative URLs (the pattern then matches the relative form). */
  urlPrefix?: string;
  /** Optional literal markers that bound the post body in the page HTML,
   * so navigation, sidebars, and comments stay out of the corpus. */
  contentStart?: string;
  contentEnd?: string;
}

export interface PostRef {
  slug: string;
  title: string;
  url: string;
  publishedAt: string | null;
}

export function essayDir(sourceId: string): string {
  return path.join(essaysRoot, sourceId);
}

export function essayPath(sourceId: string, slug: string): string {
  return path.join(essayDir(sourceId), `${slug}.md`);
}

export function essayMetaPath(sourceId: string, slug: string): string {
  return path.join(essayDir(sourceId), `${slug}.json`);
}

export function lengthRatio(sourceWords: number, rewriteWords: number): number {
  return sourceWords > 0 ? rewriteWords / sourceWords : 0;
}

/** Length rubric for training pairs: the rewrite must keep roughly the
 * original's word count. A rewrite far outside the band summarized or
 * padded instead of rewriting, which rots the pair for training. */
export function withinLengthBand(
  sourceWords: number,
  rewriteWords: number,
  minRatio = 0.7,
  maxRatio = 1.3,
): boolean {
  const ratio = lengthRatio(sourceWords, rewriteWords);
  return ratio >= minRatio && ratio <= maxRatio;
}

export function modelSlug(model: string): string {
  return model.replace(/[^a-z0-9.]+/gi, '-').toLowerCase();
}

export function rewritePath(sourceId: string, slug: string, model: string): string {
  return path.join(rewritesRoot, sourceId, `${slug}.${modelSlug(model)}.md`);
}

export function rewriteMetaPath(sourceId: string, slug: string, model: string): string {
  return path.join(rewritesRoot, sourceId, `${slug}.${modelSlug(model)}.json`);
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'user-agent': userAgent } });
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return response.text();
}

/** Parse paulgraham.com/articles.html: relative links only, which excludes
 * the off-site entries the page also lists. */
export function parseArticleList(html: string, baseUrl: string): PostRef[] {
  const skip = new Set(['index.html', 'articles.html', 'rss.html', 'books.html', 'bio.html', 'faq.html']);
  const refs: PostRef[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\s+href="([a-z0-9]+\.html)"\s*>([^<]+)<\/a>/gi)) {
    const file = match[1].toLowerCase();
    const slug = file.slice(0, -'.html'.length);
    if (skip.has(file) || seen.has(slug)) continue;
    seen.add(slug);
    refs.push({ slug, title: match[2].trim(), url: new URL(file, baseUrl).toString(), publishedAt: null });
  }
  return refs;
}

/** Parse a listing page for post URLs carrying their date. All groups but
 * the last are date parts; missing month/day default to 01. */
export function parsePostLinks(html: string, pattern: string, urlPrefix = ''): PostRef[] {
  const refs: PostRef[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(new RegExp(pattern, 'gi'))) {
    const groups = match.slice(1);
    if (groups.length < 2) throw new Error('linkPattern needs at least a date group and a slug group');
    const slug = groups[groups.length - 1].toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug === '' || seen.has(slug)) continue;
    seen.add(slug);
    const [year, month = '01', day = '01'] = groups.slice(0, -1);
    refs.push({
      slug,
      title: '',
      url: `${urlPrefix}${match[0]}`,
      publishedAt: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
    });
  }
  return refs;
}

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Paul Graham essays open with a bare "March 2020" line. */
export function extractMonthYearDate(text: string): string | null {
  const head = text.slice(0, 600);
  const match = head.match(new RegExp(`^(${monthNames.join('|')})\\s+((?:19|20)\\d{2})$`, 'm'));
  if (!match) return null;
  const month = String(monthNames.indexOf(match[1]) + 1).padStart(2, '0');
  return `${match[2]}-${month}-01`;
}

function scopeContent(html: string, source: HumanSource): string {
  let scoped = html;
  if (source.contentStart) {
    const start = scoped.indexOf(source.contentStart);
    if (start >= 0) scoped = scoped.slice(start + source.contentStart.length);
  }
  if (source.contentEnd) {
    const end = scoped.indexOf(source.contentEnd);
    if (end >= 0) scoped = scoped.slice(0, end);
  }
  return scoped;
}

interface FetchOutcome {
  slug: string;
  words: number;
  publishedAt: string | null;
  skipped: boolean;
}

async function fetchOnePost(source: HumanSource, ref: PostRef): Promise<FetchOutcome> {
  if (existsSync(essayPath(source.id, ref.slug))) {
    const meta = JSON.parse(readFileSync(essayMetaPath(source.id, ref.slug), 'utf8')) as {
      words: number;
      publishedAt?: string | null;
    };
    return { slug: ref.slug, words: meta.words, publishedAt: meta.publishedAt ?? null, skipped: true };
  }
  const html = await fetchPage(ref.url);
  const { text } = extractHtmlText(scopeContent(html, source));
  const { title } = extractHtmlText(html);
  const publishedAt = ref.publishedAt ?? extractMonthYearDate(text);
  mkdirSync(essayDir(source.id), { recursive: true });
  writeFileSync(essayPath(source.id, ref.slug), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  writeJsonPretty(essayMetaPath(source.id, ref.slug), {
    slug: ref.slug,
    sourceId: source.id,
    author: source.author,
    url: ref.url,
    title: title || ref.title,
    publishedAt,
    fetchedAt: new Date().toISOString(),
    words: wordCount(text),
    sha256: sha256(text),
  });
  return { slug: ref.slug, words: wordCount(text), publishedAt, skipped: false };
}

async function listPosts(source: HumanSource): Promise<PostRef[]> {
  if (source.kind === 'paulgraham') {
    const listUrl = 'https://paulgraham.com/articles.html';
    return parseArticleList(await fetchPage(listUrl), listUrl);
  }
  if (!source.listUrls || !source.linkPattern) {
    throw new Error(`source ${source.id}: listing kind needs listUrls and linkPattern`);
  }
  let listUrls = source.listUrls;
  if (source.listPagePattern) {
    const pages = new Set<string>();
    for (const url of source.listUrls) {
      for (const match of (await fetchPage(url)).matchAll(new RegExp(source.listPagePattern, 'gi'))) {
        pages.add(match[0]);
      }
    }
    listUrls = [...pages];
  }
  const refs: PostRef[] = [];
  const seen = new Set<string>();
  for (const url of listUrls) {
    for (const ref of parsePostLinks(await fetchPage(url), source.linkPattern, source.urlPrefix)) {
      if (seen.has(ref.slug)) continue;
      seen.add(ref.slug);
      refs.push(ref);
    }
  }
  return refs;
}

export const fetchPosts = workflow<{ source: HumanSource; limit: number }>()(async (ctx, { source, limit }) => {
  const refs = await ctx.step(() => listPosts(source), {
    name: 'list',
    retry: { attempts: 3, backoff: 'exponential', baseMs: 1000 },
    timeoutMs: 60_000,
  });
  ctx.log(`${source.id}: listing has ${refs.length} posts`);
  const chosen = limit > 0 ? refs.slice(0, limit) : refs;
  const results = await ctx.parallel(
    chosen.map((ref) => () =>
      ctx.step(() => fetchOnePost(source, ref), {
        name: `post-${ref.slug}`,
        retry: { attempts: 3, backoff: 'exponential', baseMs: 2000 },
        timeoutMs: 60_000,
      }),
    ),
    { concurrency: 2 },
  );
  const ok = results.filter((r) => r.ok).map((r) => (r as { ok: true; value: FetchOutcome }).value);
  const failed = chosen.filter((_, i) => !results[i].ok).map((ref) => ref.slug);
  return {
    sourceId: source.id,
    listed: refs.length,
    fetched: ok.filter((r) => !r.skipped).length,
    skipped: ok.filter((r) => r.skipped).length,
    undated: ok.filter((r) => r.publishedAt === null).length,
    failed,
    totalWords: ok.reduce((sum, r) => sum + r.words, 0),
  };
});

export interface RewritePair {
  sourceId: string;
  slug: string;
  model: string;
}

interface RewriteOutcome {
  sourceId: string;
  slug: string;
  model: string;
  words: number;
  costUsd: number;
  skipped: boolean;
  truncated: boolean;
}

async function rewriteOne(pair: RewritePair, maxTokens: number): Promise<RewriteOutcome> {
  const { sourceId, slug, model } = pair;
  if (existsSync(rewritePath(sourceId, slug, model))) {
    return { sourceId, slug, model, words: 0, costUsd: 0, skipped: true, truncated: false };
  }
  const config = loadConfig();
  const essay = readFileSync(essayPath(sourceId, slug), 'utf8');
  const template = readFileSync(path.join(simplifyRoot, 'prompts', 'human-rewrite-v1.md'), 'utf8');
  const result = await chat({
    model,
    messages: [{ role: 'user', content: template.replace('{{ESSAY}}', essay.trim()) }],
    purpose: 'human-rewrite',
    label: 'human-pairs',
    capUsd: config.capUsd,
    maxTokens,
    seed: config.seed,
    reasoning: { effort: 'low' },
  });
  const text = stripEmoji(result.text.trim());
  if (text.length === 0) throw new Error(`${model} returned empty rewrite (finish: ${result.finishReason ?? '?'})`);
  const truncated = result.finishReason === 'length';
  mkdirSync(path.join(rewritesRoot, sourceId), { recursive: true });
  writeFileSync(rewritePath(sourceId, slug, model), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  writeJsonPretty(rewriteMetaPath(sourceId, slug, model), {
    sourceId,
    slug,
    model,
    promptVersion: 'human-rewrite-v1',
    ts: new Date().toISOString(),
    words: wordCount(text),
    sourceWords: wordCount(essay),
    costUsd: result.costUsd,
    finishReason: result.finishReason,
    truncated,
    requestId: result.requestId,
  });
  return { sourceId, slug, model, words: wordCount(text), costUsd: result.costUsd, skipped: false, truncated };
}

export const rewritePosts = workflow<{ pairs: RewritePair[]; maxTokens: number; concurrency: number }>()(
  async (ctx, { pairs, maxTokens, concurrency }) => {
    const results = await ctx.parallel(
      pairs.map((pair) => () =>
        ctx.step(() => rewriteOne(pair, maxTokens), {
          name: `rw-${pair.sourceId}-${pair.slug}-${modelSlug(pair.model)}`,
          retry: { attempts: 2, backoff: 'exponential', baseMs: 3000 },
          timeoutMs: 600_000,
        }),
      ),
      { concurrency },
    );
    const ok = results.filter((r) => r.ok).map((r) => (r as { ok: true; value: RewriteOutcome }).value);
    const failed = pairs.filter((_, i) => !results[i].ok).map((p) => `${p.sourceId}/${p.slug}@${p.model}`);
    return {
      written: ok.filter((r) => !r.skipped).length,
      skipped: ok.filter((r) => r.skipped).length,
      truncated: ok.filter((r) => r.truncated).map((r) => `${r.sourceId}/${r.slug}@${r.model}`),
      failed,
      costUsd: Math.round(ok.reduce((sum, r) => sum + r.costUsd, 0) * 1e4) / 1e4,
    };
  },
);
