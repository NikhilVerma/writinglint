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

for (const repo of repos) {
  try {
    const prs = JSON.parse(
      gh(['pr', 'list', '-R', repo, '--state', 'merged', '--limit', String(perRepo), '--json', 'number,body,url']),
    ) as { number: number; body: string; url: string }[];
    for (const pr of prs) offer(repo, 'pr', String(pr.number), pr.url, pr.body);

    const releases = JSON.parse(
      gh(['release', 'list', '-R', repo, '--limit', '30', '--json', 'tagName']),
    ) as { tagName: string }[];
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
