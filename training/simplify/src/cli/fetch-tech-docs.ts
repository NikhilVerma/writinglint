import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { simplifyRoot } from '../lib/env.ts';
import { extractAnchors } from '../lib/faithfulness.ts';

// Fetches real pull-request descriptions and release notes from public
// repositories, because the GRPO prompt set is six essay bloggers and the
// copying it exists to punish only shows up on identifier-dense technical
// prose. Nothing here is written by hand; every document is somebody's real
// writing, and it lands in the gitignored corpus like every other source.
//
//   npx tsx src/cli/fetch-tech-docs.ts --per-repo 120
//
// The repositories below are large, unrelated to this project, and known for
// long prose pull-request descriptions rather than one-line templates.
const DEFAULT_REPOS = [
  'kubernetes/kubernetes',
  'rust-lang/rust',
  'microsoft/TypeScript',
  'nodejs/node',
  'pytorch/pytorch',
  'denoland/deno',
  'grafana/grafana',
  'elastic/elasticsearch',
  'hashicorp/terraform',
  'apache/airflow',
  'ClickHouse/ClickHouse',
  'tokio-rs/tokio',
];

const { values } = parseArgs({
  options: {
    repo: { type: 'string', multiple: true },
    'per-repo': { type: 'string', default: '120' },
    'min-words': { type: 'string', default: '120' },
    'max-words': { type: 'string', default: '900' },
    'min-anchors': { type: 'string', default: '3' },
    out: { type: 'string', default: 'runs/docs-technical' },
    /** Merge window, as `YYYY-MM-DD..YYYY-MM-DD`. Set it to buy a provenance
     * guarantee no filter can give you afterwards.
     *
     * The corpus this replaces is current pull requests, and 24 of its 639
     * documents say "Generated with [Claude Code]" in the body, 12 mention
     * Copilot, and 48 carry GitHub's generative-AI disclosure prompt. Those are
     * only the ones that declare it. Every one of them was being used as a
     * human target the rewriter learns to imitate, and the technical band was
     * calibrated on them.
     *
     * 2018-01-01..2019-12-31 is the window worth having: GPT-2 shipped in
     * February 2019 and GPT-3 not until June 2020, so nothing merged inside it
     * was machine-written at any scale, while pull-request prose had already
     * settled into the shape it still has. Going earlier costs more than it
     * buys — 2013 pull-request bodies are mostly one line. */
    'merged-at': { type: 'string' },
  },
});
const repos = values.repo?.length ? values.repo : DEFAULT_REPOS;
const perRepo = Number(values['per-repo']);
const minWords = Number(values['min-words']);
const maxWords = Number(values['max-words']);
const minAnchors = Number(values['min-anchors']);
const outDir = path.resolve(simplifyRoot, values.out!);

const gh = (args: string[]): string =>
  execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

/** Strips the scaffolding a template puts around the part a human wrote. */
function clean(body: string): string {
  return body
    .replace(/\r\n/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^```release-note[\s\S]*?```$/gm, '')
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (/^- \[[ xX]\]/.test(t)) return false; // checklist items
      if (/^(Signed-off-by|Co-authored-by|Fixes|Closes|Refs):?\s/i.test(t)) return false;
      if (/^!\[[^\]]*\]\(/.test(t)) return false; // bare images and badges
      if (/^\/(cc|assign|kind|area|sig|hold|retest|lgtm)\b/.test(t)) return false; // bot commands
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;
const anchorDensity = (t: string) => {
  const words = wordCount(t);
  if (words === 0) return 0;
  const anchors = extractAnchors(t);
  return (anchors.numbers.size + anchors.symbols.size) / (words / 100);
};

mkdirSync(outDir, { recursive: true });
const sidecar = path.join(outDir, 'provenance.jsonl');
const seen = new Set<string>();
let kept = 0;
let dropped = 0;

function offer(repo: string, kind: string, ref: string, url: string, raw: string): void {
  const text = clean(raw ?? '');
  const words = wordCount(text);
  if (words < minWords || words > maxWords) return void (dropped += 1);
  const density = anchorDensity(text);
  if (density < minAnchors) return void (dropped += 1);
  const key = text.slice(0, 400);
  if (seen.has(key)) return void (dropped += 1);
  seen.add(key);
  const slug = `${repo.replace('/', '-')}-${kind}-${ref}`;
  writeFileSync(path.join(outDir, `${slug}.md`), `${text}\n`);
  appendFileSync(
    sidecar,
    `${JSON.stringify({ file: `${slug}.md`, repo, kind, ref, url, words, anchorsPer100Words: Number(density.toFixed(2)) })}\n`,
  );
  kept += 1;
}

/** Quarter-wide slices of a `YYYY-MM-DD..YYYY-MM-DD` window.
 *
 * GitHub's search API stops at 1000 results per query and says nothing when it
 * truncates, so one two-year query would quietly return the same recent slice
 * of every large repository. Quarters keep each query well under the cap. */
function quarters(window: string): string[] {
  const [from, to] = window.split('..');
  const out: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  while (`${year}-${String(month).padStart(2, '0')}-01` <= to) {
    const endMonth = month + 2;
    const endYear = year + Math.floor((endMonth - 1) / 12);
    const wrapped = ((endMonth - 1) % 12) + 1;
    const last = new Date(Date.UTC(endYear, wrapped, 0)).getUTCDate();
    out.push(`${year}-${String(month).padStart(2, '0')}-01..${endYear}-${String(wrapped).padStart(2, '0')}-${last}`);
    month += 3;
    if (month > 12) {
      month -= 12;
      year += 1;
    }
  }
  return out;
}

const mergedAt = values['merged-at'];

for (const repo of repos) {
  try {
    if (mergedAt) {
      for (const slice of quarters(mergedAt)) {
        const found = JSON.parse(
          gh(['search', 'prs', '-R', repo, '--merged-at', slice, '--limit', String(perRepo), '--json', 'number,body,url']),
        ) as { number: number; body: string; url: string }[];
        for (const pr of found) offer(repo, 'pr', String(pr.number), pr.url, pr.body);
      }
    } else {
      const prs = JSON.parse(
        gh(['pr', 'list', '-R', repo, '--state', 'merged', '--limit', String(perRepo), '--json', 'number,body,url']),
      ) as { number: number; body: string; url: string }[];
      for (const pr of prs) offer(repo, 'pr', String(pr.number), pr.url, pr.body);
    }

    // Release notes are skipped under a merge window. `gh release list` cannot
    // filter by date, and mixing undated documents into a dated corpus throws
    // away the only thing the window was bought for.
    const releases = mergedAt
      ? []
      : (JSON.parse(gh(['release', 'list', '-R', repo, '--limit', '30', '--json', 'tagName'])) as { tagName: string }[]);
    for (const rel of releases) {
      const body = JSON.parse(gh(['release', 'view', rel.tagName, '-R', repo, '--json', 'body,url'])) as {
        body: string;
        url: string;
      };
      offer(repo, 'release', rel.tagName.replace(/[^A-Za-z0-9.]/g, '-'), body.url, body.body);
    }
    console.log(`${repo}: ${kept} kept so far`);
  } catch (error) {
    console.error(`${repo}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }
}

console.log(
  `wrote ${kept} documents to ${outDir} (dropped ${dropped} outside ${minWords}-${maxWords} words, ` +
    `under ${minAnchors} anchors per 100 words, or duplicated)`,
);
