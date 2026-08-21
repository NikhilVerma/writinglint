import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { runsDir } from '../lib/env.ts';
import { readJsonl } from '../lib/store.ts';
import { normalizeOutput } from '../lib/text.ts';

// Builds a local side-by-side page from an eval directory, so the rewrites can
// be read rather than summarised into an average. Nothing leaves the machine:
// the corpus is private, so this writes a file to open from disk.
//
//   node src/cli/compare.ts --dir runs/holdout-eval --sort echo
//   open runs/holdout-eval/compare.html

const { values } = parseArgs({
  options: {
    dir: { type: 'string', default: path.join(runsDir, 'holdout-eval') },
    sort: { type: 'string', default: 'echo' },
    scored: { type: 'string', multiple: true, default: [] },
  },
});

interface Row { id: string; input: string; output: string }
interface Scored { id: string; reward: number; echoRate: number; findingsPer1kWords: number; inventedAnchors: number; degenerate: string | null }

const dir = values.dir as string;
const variants = ['base', 'final', 'checkpoint-450'].filter((v) => {
  try { readFileSync(path.join(dir, `${v}.jsonl`)); return true; } catch { return false; }
});

const rows = new Map<string, Record<string, Row>>();
for (const v of variants) {
  for (const row of readJsonl<Row>(path.join(dir, `${v}.jsonl`))) {
    if (!rows.has(row.id)) rows.set(row.id, {});
    rows.get(row.id)![v] = { ...row, output: normalizeOutput(row.output) };
  }
}

const scores = new Map<string, Record<string, Scored>>();
for (const v of variants) {
  let parsed: Scored[] = [];
  try { parsed = readJsonl<Scored>(`/tmp/${path.basename(dir) === 'pr-eval' ? 'pr' : 'holdout'}-${v}.scored.jsonl`); } catch { /* optional */ }
  for (const s of parsed) {
    if (!scores.has(s.id)) scores.set(s.id, {});
    scores.get(s.id)![v] = s;
  }
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Highlights the words the rewrite lifted straight from its source, using the
// same 4-gram test the reward scores with, so the page and the number agree.
// Marking whole sentences instead would have missed the common case: a model
// that reorders a clause and keeps every phrase inside it.
const ECHO_N = 4;
const normalize = (word: string) => word.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Splits into runs of word and non-word, so the original spacing survives. */
const tokenize = (text: string) => text.split(/([^\s]+)/).filter((part) => part !== '');

const sourceGrams = (source: string) => {
  const tokens = tokenize(source).map(normalize).filter(Boolean);
  const grams = new Set<string>();
  for (let i = 0; i + ECHO_N <= tokens.length; i += 1) grams.add(tokens.slice(i, i + ECHO_N).join(' '));
  return grams;
};

const markEcho = (output: string, source: string) => {
  const grams = sourceGrams(source);
  const parts = tokenize(output);
  // Index of each real word within `parts`, so a match can be mapped back to
  // the exact positions to highlight without disturbing the whitespace runs.
  const wordAt: number[] = [];
  const normed: string[] = [];
  parts.forEach((part, i) => {
    const n = normalize(part);
    if (n) { wordAt.push(i); normed.push(n); }
  });
  const lifted = new Set<number>();
  for (let i = 0; i + ECHO_N <= normed.length; i += 1) {
    if (!grams.has(normed.slice(i, i + ECHO_N).join(' '))) continue;
    for (let k = i; k < i + ECHO_N; k += 1) lifted.add(wordAt[k]);
  }
  // Dim the lifted words rather than highlighting them. On a document the base
  // model returns almost verbatim, marking the copy paints the whole column
  // solid and hides the one thing worth reading: what the model wrote itself.
  const marked = parts
    .map((part, i) => (lifted.has(i) ? `<span class="lift">${escape(part)}</span>` : escape(part)))
    .join('');
  const fresh = normed.length ? 1 - lifted.size / wordAt.length : 0;
  return { html: marked, fresh };
};

const ids = [...rows.keys()].sort((a, b) => {
  if (values.sort === 'id') return a.localeCompare(b);
  const at = scores.get(a)?.base?.echoRate ?? 0;
  const bt = scores.get(b)?.base?.echoRate ?? 0;
  return bt - at;
});

const cell = (id: string, v: string) => {
  const s = scores.get(id)?.[v];
  const meta = s
    ? `echo ${(s.echoRate * 100).toFixed(0)}% · reward ${s.reward.toFixed(2)} · ${s.findingsPer1kWords.toFixed(1)}/1k${s.inventedAnchors ? ` · ${s.inventedAnchors} invented` : ''}${s.degenerate ? ` · ${s.degenerate}` : ''}`
    : '';
  const { html: body, fresh } = markEcho(rows.get(id)![v]?.output ?? '', rows.get(id)!.base?.input ?? '');
  return `<td><div class="own">${(fresh * 100).toFixed(0)}% its own words</div><div class="meta">${meta}</div><div class="body">${body}</div></td>`;
};

const html = `<!doctype html><meta charset="utf-8"><title>Simplifier comparison</title>
<style>
 body{font:15px/1.55 -apple-system,system-ui,sans-serif;margin:0;background:#fbfbfa;color:#1c1c1a}
 header{padding:16px 20px;border-bottom:1px solid var(--line,#e2e2dd);position:sticky;top:0;background:inherit;z-index:2}
 h1{font-size:16px;margin:0 0 4px}
 .hint{color:#6b6b66;font-size:13px;max-width:70ch}
 details{margin:12px 20px;border:1px solid #e2e2dd;border-radius:8px;padding:10px 14px}
 summary{cursor:pointer;font-weight:600}
 table{width:100%;border-collapse:collapse;margin-top:10px;table-layout:fixed}
 th,td{border:1px solid #e2e2dd;padding:10px;vertical-align:top;width:25%}
 th{font-size:13px;text-align:left;background:rgba(127,127,127,.08)}
 .own{font-size:13px;font-weight:600;margin-bottom:2px}
 .meta{font-size:12px;color:#6b6b66;margin-bottom:8px}
 .body{white-space:pre-wrap;font-size:14px}
 /* Lifted straight from the source: pushed back so it reads as background. */
 .lift{color:#b0b0a8}
 @media(prefers-color-scheme:dark){
  body{background:#16171a;color:#e8e8e4}
  details,td,th{border-color:#33343a}
  .hint,.meta{color:#9a9a94}
  .lift{color:#54565c}
 }
</style>
<header><h1>${escape(path.basename(dir))} — ${ids.length} documents, hardest copiers first</h1>
<div class="hint">Greyed-out words were lifted from the source: any run of four words the rewrite shares with its input, the same test the echo score uses. Read the words that stay dark. Those are the model's own, and the percentage above each column counts them.</div></header>
${ids
  .map((id) => {
    const s = scores.get(id)?.base;
    const label = s ? `${id} — base echo ${(s.echoRate * 100).toFixed(0)}%` : id;
    return `<details><summary>${escape(label)}</summary>
<table><tr><th>source</th>${variants.map((v) => `<th>${v}</th>`).join('')}</tr>
<tr><td><div class="meta">input</div><div class="body">${escape(rows.get(id)!.base?.input ?? '')}</div></td>
${variants.map((v) => cell(id, v)).join('')}</tr></table></details>`;
  })
  .join('\n')}`;

const out = path.join(dir, 'compare.html');
writeFileSync(out, html, 'utf8');
console.log(`wrote ${ids.length} comparisons to ${out}`);
