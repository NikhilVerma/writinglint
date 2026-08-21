/**
 * Decide which documents are actually written in English sentences.
 *
 * A large share of the corpus is machine-made: Dependabot and Renovate pull
 * requests that are version bumps, changelogs, and commit lists. There is
 * little prose in them to make worse and little for a rewriter to learn from,
 * and they drag every density measurement toward markup.
 *
 * Counting words does not separate the two — a commit list has plenty of
 * words. So this parses what is left after markup is stripped and asks whether
 * real sentences are there: a finite verb, a subject, and the ordinary
 * function words English sentences are made of.
 *
 *   npx tsx src/cli/filter-prose.ts runs/docs-technical --keep runs/prose-docs.txt
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadParser } from 'writinglint-parser-node';

const dir = process.argv[2];
if (!dir) throw new Error('usage: filter-prose <dir> [--keep path] [--min-sentences n] [--report path]');
const flag = (name: string, fallback: string | null = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const MIN_SENTENCES = Number(flag('min-sentences', '3'));
const MIN_PROSE_WORDS = Number(flag('min-words', '60'));
const keepPath = flag('keep');
const reportPath = flag('report');

/**
 * Strip everything that is not running text. Fenced code, tables, headings,
 * HTML, and bare links all carry words without carrying sentences, and a
 * changelog is mostly list items.
 */
function proseOnly(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    // A bot pull request wraps the upstream changelog in <details>. The text
    // inside is real English written by someone else about another project,
    // so stripping tags alone would let it pass as this document's prose.
    .replace(/<details[\s\S]*?<\/details>/gi, ' ')
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}#.*$/gm, ' ')
    .replace(/^\s*\|.*$/gm, ' ')
    .replace(/^\s*[-*+]\s.*$/gm, ' ')
    .replace(/^\s*\d+\.\s.*$/gm, ' ')
    .replace(/^\s*>.*$/gm, ' ')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

/** The closed-class words every stretch of English is built from. A commit
 * list or a version table barely uses them; a paragraph is roughly a third
 * of them. */
const FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'for', 'with', 'as', 'at',
  'by', 'from', 'that', 'this', 'these', 'those', 'it', 'its', 'is', 'are', 'was', 'were', 'be',
  'been', 'has', 'have', 'had', 'do', 'does', 'did', 'not', 'no', 'so', 'than', 'then', 'when',
  'while', 'we', 'you', 'they', 'their', 'there', 'here', 'which', 'who', 'what', 'can', 'will',
  'would', 'should', 'may', 'might', 'must', 'into', 'over', 'about', 'after', 'before', 'because',
]);

const SUBJECT = /^(nsubj|csubj|expl)/;

const parser = await loadParser();
const names = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
const rows: { id: string; sentences: number; proseWords: number; functionRate: number; keep: boolean }[] = [];

for (const name of names) {
  const text = proseOnly(readFileSync(join(dir, name), 'utf8'));
  const tokens = text.toLowerCase().match(/[a-z']+/g) ?? [];
  const functionRate = tokens.length ? tokens.filter((w) => FUNCTION_WORDS.has(w)).length / tokens.length : 0;
  const proseWords = text.split(/\s+/).filter(Boolean).length;

  let sentences = 0;
  if (proseWords >= 20) {
    const parsed = await parser.parse(text);
    for (const sentence of parsed) {
      const ts = sentence.tokens;
      const root = ts.find((t) => t.deprel === 'root');
      if (!root) continue;
      // A finite clause: a verb heading it, or a copula pinned under a
      // predicate noun or adjective. Either way something is asserted.
      const finite = root.upos === 'VERB' || ts.some((t) => t.head === root.id && t.deprel === 'cop');
      const subject = ts.some((t) => t.head === root.id && SUBJECT.test(t.deprel));
      if (finite && subject && ts.length >= 5) sentences += 1;
    }
  }

  rows.push({
    id: name,
    sentences,
    proseWords,
    functionRate,
    // Three independent checks. A commit list fails the sentence count, a
    // table of versions fails the function-word rate, and a stub fails on
    // length. A document has to look like English on all three.
    keep: sentences >= MIN_SENTENCES && proseWords >= MIN_PROSE_WORDS && functionRate >= 0.25,
  });
}

const kept = rows.filter((r) => r.keep);
const dropped = rows.filter((r) => !r.keep);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

console.log(`${kept.length} of ${rows.length} documents read as English prose (${Math.round((kept.length / rows.length) * 100)}%)`);
console.log(`  kept:    median ${median(kept.map((r) => r.sentences))} sentences, ${median(kept.map((r) => r.proseWords))} prose words, ${(median(kept.map((r) => r.functionRate)) * 100).toFixed(0)}% function words`);
console.log(`  dropped: median ${median(dropped.map((r) => r.sentences))} sentences, ${median(dropped.map((r) => r.proseWords))} prose words, ${(median(dropped.map((r) => r.functionRate)) * 100).toFixed(0)}% function words`);
const why = {
  'too few sentences': dropped.filter((r) => r.sentences < MIN_SENTENCES).length,
  'too little prose': dropped.filter((r) => r.proseWords < MIN_PROSE_WORDS).length,
  'not enough function words': dropped.filter((r) => r.functionRate < 0.25).length,
};
console.log('  reasons (overlapping):', why);

if (keepPath) {
  writeFileSync(keepPath, kept.map((r) => r.id).join('\n') + '\n');
  console.log(`wrote ${kept.length} names to ${keepPath}`);
}
if (reportPath) {
  writeFileSync(reportPath, JSON.stringify(rows, null, 1));
  console.log(`wrote ${reportPath}`);
}
