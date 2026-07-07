#!/usr/bin/env node
/**
 * Better Write CLI — score your own docs and see which AI-writing flags fire.
 *
 *   npm run cli -- essay.txt              one doc
 *   npm run cli -- posts/*.md             many docs (glob expanded by the shell)
 *   cat essay.txt | npm run cli           stdin
 *   npm run cli -- --json essay.txt       machine-readable
 *   npm run cli -- --quiet posts/*.md     one score line per doc (no highlights)
 *
 * The score is the trained classifier (same as the web app) when
 * models/classifier.json is present; otherwise it falls back to the heuristic.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyze, segments } from './detector/analyze.js';
import { loadParser } from './detector/parser-node.js';
import { CATEGORIES, type Category } from './detector/types.js';
import type { Model } from './detector/classifier.js';

// ── tiny ANSI helpers (no deps) ──────────────────────────────────────────
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s: string) => paint('1', s);
const dim = (s: string) => paint('2', s);

const CAT_BG: Record<Category, string> = {
  significance: '48;5;131',
  parallelism: '48;5;68',
  promo: '48;5;173',
  vague: '48;5;137',
  meta: '48;5;97',
  'ai-vocab': '48;5;169',
  'rule-of-three': '48;5;72',
  conjunctions: '48;5;71',
  formatting: '48;5;102',
};
const swatch = (c: Category) => (useColor ? `\x1b[${CAT_BG[c]}m  \x1b[0m` : '##');

// Verdict colour bands (match the web app's probability bands).
function scoreColor(score: number): (s: string) => string {
  if (score < 20) return (s) => paint('32', s); // green
  if (score < 45) return (s) => paint('92', s);
  if (score < 60) return (s) => paint('33', s); // amber
  if (score < 80) return (s) => paint('93', s);
  return (s) => paint('31', s); // red
}

// The classifier is a data-free JSON next to the parser model.
function loadModel(): Model | undefined {
  const p = fileURLToPath(new URL('../models/classifier.json', import.meta.url));
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Model) : undefined;
}

// ~50 words is roughly where the classifier has enough signal to be trusted.
const MIN_CONFIDENT_WORDS = 50;

async function reportFile(
  label: string,
  text: string,
  parser: Awaited<ReturnType<typeof loadParser>>,
  model: Model | undefined,
  opts: { json: boolean; quiet: boolean; single: boolean },
): Promise<{ label: string; score: number; verdict: string; flags: number; words: number }> {
  const result = await analyze(text, parser, model);
  const { findings, stats, counts } = result;

  if (opts.json) {
    console.log(JSON.stringify({ file: label, ...result }, null, 2));
    return { label, score: stats.score, verdict: stats.verdict, flags: findings.length, words: stats.words };
  }

  const colour = scoreColor(stats.score);
  const header = `${bold(label)}  ${colour(bold(`${stats.score}/100`))} ${dim('·')} ${colour(stats.verdict)}`;
  console.log(opts.single ? '' : `\n${'─'.repeat(60)}`);
  console.log(header);
  console.log(
    dim(`${stats.words} words · ${stats.sentences} sentences · ${findings.length} flags`),
  );
  if (stats.words < MIN_CONFIDENT_WORDS) {
    console.log(dim(`⚠ short input (<${MIN_CONFIDENT_WORDS} words) — the score is unreliable; trust the flags, not the number.`));
  }

  // Inline highlighted reproduction (single doc, non-quiet, colour terminal).
  if (opts.single && !opts.quiet && useColor) {
    let out = '';
    for (const seg of segments(text, findings)) {
      const chunk = text.slice(seg.start, seg.end);
      out += seg.finding ? `\x1b[${CAT_BG[seg.finding.category]}m${chunk}\x1b[0m` : chunk;
    }
    console.log(`\n${out.trimEnd()}`);
  }

  // The flags themselves — what fired, where, and why.
  if (!opts.quiet) {
    if (findings.length === 0) {
      console.log(dim('\nNo AI-style flags. (The number above still reflects overall style.)'));
    } else {
      console.log();
      for (const f of findings) {
        const quote = f.text.replace(/\s+/g, ' ').trim();
        console.log(`  ${swatch(f.category)} ${bold(CATEGORIES[f.category].label)}  ${dim('“')}${quote}${dim('”')}`);
        console.log(`      ${dim(f.message)}`);
      }
      // per-category tally
      const rows = (Object.keys(counts) as Category[]).filter((c) => counts[c] > 0).sort((a, b) => counts[b] - counts[a]);
      console.log('\n  ' + rows.map((c) => `${CATEGORIES[c].label} ${bold(String(counts[c]))}`).join(dim('  ·  ')));
    }
  }

  return { label, score: stats.score, verdict: stats.verdict, flags: findings.length, words: stats.words };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log('Usage: better-write [--json] [--quiet] [files…]   (reads stdin if no files)');
    return;
  }
  const json = args.includes('--json');
  const quiet = args.includes('--quiet');
  const files = args.filter((a) => !a.startsWith('-'));

  const parser = await loadParser();
  const model = loadModel();
  if (!model && !json) console.log(dim('(models/classifier.json not found — using heuristic score. Run `npm run train`.)'));

  const single = files.length <= 1;
  const inputs = files.length
    ? files.map((f) => ({ label: f, text: readFileSync(f, 'utf8') }))
    : [{ label: 'stdin', text: readFileSync(0, 'utf8') }];

  const summary = [];
  for (const { label, text } of inputs) {
    summary.push(await reportFile(label, text, parser, model, { json, quiet, single }));
  }

  // Multi-doc summary table, sorted most-AI-shaped first.
  if (!json && summary.length > 1) {
    console.log(`\n${'═'.repeat(60)}\n${bold('Summary')} (most AI-shaped first)`);
    for (const r of [...summary].sort((a, b) => b.score - a.score)) {
      const colour = scoreColor(r.score);
      const warn = r.words < MIN_CONFIDENT_WORDS ? dim(' ⚠short') : '';
      console.log(`  ${colour(String(r.score).padStart(3))}/100  ${r.label}  ${dim(`${r.flags} flags`)}${warn}`);
    }
  }
}

await main();
