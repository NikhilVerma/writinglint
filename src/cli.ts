#!/usr/bin/env node
/**
 * Better Write CLI — flag AI-writing style tells in a file or stdin.
 *
 *   better-write essay.txt
 *   cat essay.txt | better-write
 *   better-write --json essay.txt
 */
import { readFileSync } from 'node:fs';
import { analyze, segments } from './detector/analyze.js';
import { loadParser } from './detector/parser-node.js';
import { CATEGORIES, type Category } from './detector/types.js';

// ── tiny ANSI helpers (no deps) ──────────────────────────────────────────
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s: string) => paint('1', s);
const dim = (s: string) => paint('2', s);

/** 256-colour background per category so highlighted terminal output reads. */
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

function readInput(args: string[]): string {
  const file = args.find((a) => !a.startsWith('-'));
  if (file) return readFileSync(file, 'utf8');
  return readFileSync(0, 'utf8'); // stdin
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log('Usage: better-write [--json] [file]   (reads stdin if no file)');
    return;
  }

  const text = readInput(args);
  const parser = await loadParser();
  const result = await analyze(text, parser);

  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Highlighted reproduction of the text with inline colour, using the same
  // overlap-resolution the web UI uses so both renderers agree.
  const { findings, stats, counts } = result;
  let out = '';
  for (const seg of segments(text, findings)) {
    const chunk = text.slice(seg.start, seg.end);
    if (seg.finding) {
      out += useColor ? `\x1b[${CAT_BG[seg.finding.category]}m${chunk}\x1b[0m` : `[${chunk}]`;
    } else {
      out += chunk;
    }
  }

  console.log(out.trimEnd());
  console.log();
  console.log(bold(`Score ${stats.score}/100`) + dim(`  ·  ${stats.verdict}`));
  console.log(
    dim(
      `${stats.words} words · ${stats.sentences} sentences · ${stats.density} tells/100w · ${findings.length} findings`,
    ),
  );
  console.log();

  const rows = (Object.keys(counts) as Category[])
    .filter((c) => counts[c] > 0)
    .sort((a, b) => counts[b] - counts[a]);
  if (rows.length === 0) {
    console.log(dim('No AI-style tells found. Reads human.'));
  } else {
    for (const c of rows) {
      const swatch = useColor ? `\x1b[${CAT_BG[c]}m  \x1b[0m` : '##';
      console.log(`  ${swatch} ${String(counts[c]).padStart(3)}  ${CATEGORIES[c].label}`);
    }
  }
}

await main();
