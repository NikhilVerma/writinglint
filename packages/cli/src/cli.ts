#!/usr/bin/env node
/**
 * WritingLint CLI — lint prose for grammar/style rules (the ai-style rulepack
 * by default) and, separately, score how AI-shaped it reads.
 *
 *   writinglint essay.txt                 lint one doc (+ score)
 *   writinglint lint posts/*.md           lint many docs
 *   writinglint score posts/*.md          just the AI-style score per doc
 *   cat essay.txt | writinglint           stdin
 *   writinglint --json essay.txt          machine-readable
 *   writinglint --quiet posts/*.md        one line per doc (no per-lint detail)
 *   writinglint --config writinglint.config.ts …   use a specific config
 *
 * Config: a `writinglint.config.ts` in the working directory is picked up automatically;
 * otherwise the ai-style `recommended` config is used.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Linter, resolveConfig, segments, type Config, type Lint } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { recommended, score, CATEGORIES, CATEGORY_ORDER, type Model } from 'writinglint-rulepack-ai-style';
import { loadModelNode } from 'writinglint-rulepack-ai-style/node';

// ── tiny ANSI helpers (no deps) ──────────────────────────────────────────
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s: string) => paint('1', s);
const dim = (s: string) => paint('2', s);

const CAT_BG: Record<string, string> = {
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
const swatch = (c: string) => (useColor ? `\x1b[${CAT_BG[c] ?? '48;5;102'}m  \x1b[0m` : '##');

// Verdict colour bands (match the web app's probability bands).
function scoreColor(s: number): (t: string) => string {
  if (s < 20) return (t) => paint('32', t); // green
  if (s < 45) return (t) => paint('92', t);
  if (s < 60) return (t) => paint('33', t); // amber
  if (s < 80) return (t) => paint('93', t);
  return (t) => paint('31', t); // red
}

// Overlap priority for the inline reproduction: earlier category = higher.
const PRIORITY = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));
const priorityOf = (l: Lint) => PRIORITY.get(l.category) ?? 99;

// ~50 words is roughly where the classifier has enough signal to be trusted.
const MIN_CONFIDENT_WORDS = 50;

/** Discover and load the config (explicit --config, or writinglint.config.* in cwd, else recommended). */
async function loadConfig(explicit?: string): Promise<Config> {
  const candidates = explicit ? [explicit] : ['writinglint.config.ts', 'writinglint.config.js', 'writinglint.config.mjs'];
  for (const c of candidates) {
    const p = resolve(process.cwd(), c);
    if (existsSync(p)) {
      const mod = (await import(pathToFileURL(p).href)) as { default?: Config };
      if (mod.default) return mod.default;
    }
  }
  return recommended;
}

interface DocSummary {
  label: string;
  score: number;
  verdict: string;
  flags: number;
  words: number;
}

async function reportFile(
  label: string,
  text: string,
  linter: Linter,
  config: ReturnType<typeof resolveConfig>,
  model: Model | undefined,
  opts: { json: boolean; quiet: boolean; single: boolean; mode: 'lint' | 'score' },
): Promise<DocSummary> {
  const { doc, lints } = await linter.lint(text, config);
  const words = doc.tokens.length;
  const sentences = doc.sentences.length;
  const s = score(doc, lints, model);

  if (opts.json) {
    console.log(JSON.stringify({ file: label, score: s.score, verdict: s.verdict, words, sentences, lints }, null, 2));
    return { label, score: s.score, verdict: s.verdict, flags: lints.length, words };
  }

  const colour = scoreColor(s.score);
  console.log(opts.single ? '' : `\n${'─'.repeat(60)}`);
  console.log(`${bold(label)}  ${colour(bold(`${s.score}/100`))} ${dim('·')} ${colour(s.verdict)}`);
  console.log(dim(`${words} words · ${sentences} sentences · ${lints.length} flags`));
  if (words < MIN_CONFIDENT_WORDS) {
    console.log(dim(`⚠ short input (<${MIN_CONFIDENT_WORDS} words) — the score is noisy here; the flags below are the reliable signal.`));
  }

  if (opts.mode === 'score') return { label, score: s.score, verdict: s.verdict, flags: lints.length, words };

  // Inline highlighted reproduction (single doc, non-quiet, colour terminal).
  if (opts.single && !opts.quiet && useColor) {
    let out = '';
    for (const seg of segments(text, lints, priorityOf)) {
      const chunk = text.slice(seg.start, seg.end);
      out += seg.lint ? `\x1b[${CAT_BG[seg.lint.category] ?? '48;5;102'}m${chunk}\x1b[0m` : chunk;
    }
    console.log(`\n${out.trimEnd()}`);
  }

  // The lints themselves — what fired, where, and why.
  if (!opts.quiet) {
    if (lints.length === 0) {
      console.log(dim('\nNo flags. (The score above still reflects overall style.)'));
    } else {
      console.log();
      for (const l of lints) {
        const quote = l.text.replace(/\s+/g, ' ').trim();
        const cat = CATEGORIES[l.category]?.label ?? l.category;
        console.log(`  ${swatch(l.category)} ${bold(cat)} ${dim(l.ruleId)}  ${dim('“')}${quote}${dim('”')}`);
        console.log(`      ${dim(l.message)}`);
      }
      const counts = new Map<string, number>();
      for (const l of lints) counts.set(l.category, (counts.get(l.category) ?? 0) + 1);
      const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      console.log('\n  ' + rows.map(([c, n]) => `${CATEGORIES[c]?.label ?? c} ${bold(String(n))}`).join(dim('  ·  ')));
    }
  }

  return { label, score: s.score, verdict: s.verdict, flags: lints.length, words };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log('Usage: writinglint [lint|score] [--json] [--quiet] [--config <path>] [files…]   (reads stdin if no files)');
    return;
  }
  const mode: 'lint' | 'score' = argv[0] === 'score' ? 'score' : 'lint';
  const rest = argv[0] === 'lint' || argv[0] === 'score' ? argv.slice(1) : argv;

  const json = rest.includes('--json');
  const quiet = rest.includes('--quiet');
  const cfgIdx = rest.indexOf('--config');
  const configPath = cfgIdx >= 0 ? rest[cfgIdx + 1] : undefined;
  const files = rest.filter((a, i) => !a.startsWith('-') && !(cfgIdx >= 0 && i === cfgIdx + 1));

  const parser = await loadParser();
  const linter = new Linter(parser);
  const config = resolveConfig(await loadConfig(configPath));
  const model: Model | undefined = loadModelNode();
  if (!model && !json) console.log(dim('(no trained model found — using heuristic score. Run `npm run train`.)'));

  const single = files.length <= 1;
  const inputs = files.length
    ? files.map((f) => ({ label: f, text: readFileSync(f, 'utf8') }))
    : [{ label: 'stdin', text: readFileSync(0, 'utf8') }];

  const summary: DocSummary[] = [];
  for (const { label, text } of inputs) {
    summary.push(await reportFile(label, text, linter, config, model, { json, quiet, single, mode }));
  }

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
