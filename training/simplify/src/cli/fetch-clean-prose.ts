import { mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { simplifyRoot } from '../lib/env.ts';

// Fetches public-domain prose from Project Gutenberg and slices it into
// standalone excerpts, because the RL prompt set is all text that needs work.
// A rewriter trained only on messy sources learns that rewriting always pays;
// it needs clean sources too, so restraint has something to score against.
// Nothing here is written by hand. Every word is somebody's published prose,
// and it lands in the gitignored corpus like every other source.
//
//   node src/cli/fetch-clean-prose.ts --total 250
//
// Works are chosen for plain, direct style across a spread of registers:
// memoir, reportage, polemic, science, political speech, fiction. Every id
// below was checked against the Gutenberg header for title and author before
// it was written down. Only editions Gutenberg itself hosts appear here,
// which is the licence check: Gutenberg only serves texts that are public
// domain in the US. Orwell was dropped for that reason — his first book is
// 1933 and stays under US copyright until 2029, so the Gutenberg Australia
// copies are not ours to take.
//
// The list leans on the plain-style turn of roughly 1895-1930 rather than on
// the whole public domain. A first pass took in the obvious older names and
// scored no cleaner than the technical corpus it is meant to contrast with:
// the rulepack's biggest complaint is sentence load, and long-sentence
// writers lose on it however direct their diction. Twain, Swift, Paine,
// Franklin, Bierce, Faraday, Grant, Dana, Shackleton and Wells-Barnett all
// measured above the technical median and came out, as did Upton Sinclair and
// Maugham on a second pass. That is style selection, not cherry-picking:
// whole works go, never individual excerpts.
interface Work {
  id: number;
  author: string;
  title: string;
}

const WORKS: Work[] = [
  { id: 73, author: 'Stephen Crane', title: 'The Red Badge of Courage' },
  { id: 447, author: 'Stephen Crane', title: 'Maggie: A Girl of the Streets' },
  { id: 215, author: 'Jack London', title: 'The Call of the Wild' },
  { id: 318, author: 'Jack London', title: 'John Barleycorn' },
  { id: 1688, author: 'Jack London', title: 'The People of the Abyss' },
  { id: 24, author: 'Willa Cather', title: 'O Pioneers!' },
  { id: 242, author: 'Willa Cather', title: 'My Antonia' },
  { id: 416, author: 'Sherwood Anderson', title: 'Winesburg, Ohio' },
  { id: 2814, author: 'James Joyce', title: 'Dubliners' },
  { id: 13415, author: 'Anton Chekhov', title: 'The Lady with the Dog and Other Stories' },
  { id: 1429, author: 'Katherine Mansfield', title: 'The Garden Party, and Other Stories' },
  { id: 367, author: 'Sarah Orne Jewett', title: 'The Country of the Pointed Firs' },
  { id: 4517, author: 'Edith Wharton', title: 'Ethan Frome' },
  { id: 543, author: 'Sinclair Lewis', title: 'Main Street' },
  { id: 1156, author: 'Sinclair Lewis', title: 'Babbitt' },
  { id: 233, author: 'Theodore Dreiser', title: 'Sister Carrie' },
  { id: 2641, author: 'E. M. Forster', title: 'A Room with a View' },
  { id: 217, author: 'D. H. Lawrence', title: 'Sons and Lovers' },
  { id: 863, author: 'Agatha Christie', title: 'The Mysterious Affair at Styles' },
  { id: 61262, author: 'Agatha Christie', title: 'Poirot Investigates' },
  // Hemingway is the obvious plain-style name and is usually assumed to be
  // off limits. These two are 1926 and 1927, so their US term ran out, and
  // Gutenberg hosts them. Later Hemingway is still restricted.
  { id: 67138, author: 'Ernest Hemingway', title: 'The Sun Also Rises' },
  { id: 69683, author: 'Ernest Hemingway', title: 'Men Without Women' },
  // Non-fiction, so the corpus is not all scene-setting. These are the older
  // works that survived the scoring pass.
  { id: 3076, author: 'John Reed', title: 'Ten Days That Shook the World' },
  { id: 11030, author: 'Harriet A. Jacobs', title: 'Incidents in the Life of a Slave Girl' },
  { id: 23, author: 'Frederick Douglass', title: 'Narrative of the Life of Frederick Douglass' },
  { id: 408, author: 'W. E. B. Du Bois', title: 'The Souls of Black Folk' },
  { id: 2376, author: 'Booker T. Washington', title: 'Up from Slavery' },
  { id: 2397, author: 'Helen Keller', title: 'The Story of My Life' },
  { id: 14721, author: 'Abraham Lincoln', title: 'Speeches and Letters of Abraham Lincoln' },
  { id: 944, author: 'Charles Darwin', title: 'The Voyage of the Beagle' },
  { id: 376, author: 'Daniel Defoe', title: 'A Journal of the Plague Year' },
  { id: 535, author: 'Robert Louis Stevenson', title: 'Travels with a Donkey in the Cevennes' },
];

const { values } = parseArgs({
  options: {
    total: { type: 'string', default: '250' },
    'min-words': { type: 'string', default: '150' },
    'max-words': { type: 'string', default: '700' },
    out: { type: 'string', default: 'runs/docs-clean' },
    // Sits inside the corpus dir so the whole thing is one gitignored tree;
    // the dot prefix keeps it out of the *.md glob consumers use.
    cache: { type: 'string', default: 'runs/docs-clean/.cache' },
    'delay-ms': { type: 'string', default: '2000' },
    clean: { type: 'boolean', default: false },
  },
});
const total = Number(values.total);
const minWords = Number(values['min-words']);
const maxWords = Number(values['max-words']);
const delayMs = Number(values['delay-ms']);
const outDir = path.resolve(simplifyRoot, values.out!);
const cacheDir = path.resolve(simplifyRoot, values.cache!);

const textUrl = (id: number) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
const bookUrl = (id: number) => `https://www.gutenberg.org/ebooks/${id}`;
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Caches on disk so a re-run tunes the slicing without re-hitting Gutenberg.
 * Gutenberg drops connections in long runs, so failures back off rather than
 * costing the work its excerpts. */
async function fetchBook(work: Work): Promise<string> {
  const file = path.join(cacheDir, `pg${work.id}.txt`);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await sleep(delayMs * (attempt + 1) ** 2);
    try {
      const response = await fetch(textUrl(work.id), {
        headers: { 'user-agent': 'better-write-research/0.1 (corpus building; one request per work)' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(file, body, 'utf8');
      return body;
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

/** Drops the licence boilerplate that wraps every Gutenberg plain text. */
function stripBoilerplate(raw: string): string {
  const text = raw.replace(/\r\n/g, '\n');
  const start = text.match(/^\*\*\* ?START OF TH(?:E|IS) PROJECT GUTENBERG EBOOK[^\n]*$/m);
  const end = text.match(/^\*\*\* ?END OF TH(?:E|IS) PROJECT GUTENBERG EBOOK[^\n]*$/m);
  const from = start?.index === undefined ? 0 : start.index + start[0].length;
  const to = end?.index ?? text.length;
  return dedent(text.slice(from, to));
}

/** Some editions indent every line of the book by a fixed margin, which would
 * otherwise read as verse to the block filters below. Strip the margin the
 * body as a whole shares before anything looks at relative indentation. */
function dedent(body: string): string {
  const indents = new Map<number, number>();
  for (const line of body.split('\n')) {
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    indents.set(indent, (indents.get(indent) ?? 0) + 1);
  }
  let margin = 0;
  let best = 0;
  for (const [indent, count] of indents) {
    if (count > best) [margin, best] = [indent, count];
  }
  if (margin === 0) return body;
  const strip = new RegExp(`^ {1,${margin}}`);
  return body
    .split('\n')
    .map((line) => line.replace(strip, ''))
    .join('\n');
}

const ROMAN = /^[IVXLC]+\.?$/;
const HEADING_WORD = /^(chapter|book|part|section|letter|volume|act|scene|appendix|preface|contents|index|lecture|note)\b/i;

/** True for anything that is not a paragraph of prose: headings, chapter
 * numbers, verse, transcriber notes, tables of contents, stage directions.
 * These also act as excerpt boundaries, which is what keeps an excerpt from
 * silently welding the end of one chapter onto the start of the next. */
function isBreak(block: string): boolean {
  const lines = block.split('\n');
  const flat = block.replace(/\s+/g, ' ').trim();
  if (flat === '') return true;
  if (/PROJECT GUTENBERG|Transcriber|www\.|https?:\/\/|\[Illustration|\[Footnote/i.test(flat)) return true;
  if (/^\*+$/.test(flat) || /^[-_=* ]{4,}$/.test(flat)) return true;
  if (ROMAN.test(flat) || /^\d+\.?$/.test(flat)) return true;
  // Prose almost never opens on "Chapter" or "Part", but every heading and
  // every table-of-contents line does, and a long ToC line would slip past a
  // word-count test.
  if (HEADING_WORD.test(flat)) return true;
  // Contents lines string their topics together with dashes.
  if ((flat.match(/--/g) ?? []).length >= 3) return true;
  // A short block with no sentence-ending punctuation is a title, a byline,
  // a signature, or a table row — never a paragraph.
  if (wordCount(flat) <= 14 && !/[.?!]["'”’]?$/.test(flat)) return true;
  if (flat === flat.toUpperCase() && /[A-Z]/.test(flat)) return true;
  // Verse and set-off quotations arrive hard-wrapped short and indented.
  const indented = lines.filter((line) => /^ {3,}\S/.test(line)).length;
  if (lines.length >= 2 && indented / lines.length > 0.6) return true;
  const meanLine = lines.reduce((sum, line) => sum + line.trim().length, 0) / lines.length;
  if (lines.length >= 3 && meanLine < 45) return true;
  return false;
}

/** Gutenberg hard-wraps at about 70 columns; excerpts want one line per
 * paragraph so the linter sees sentences rather than fragments. */
function unwrap(block: string): string {
  return block
    .replace(/\s+/g, ' ')
    .replace(/_([^_]+)_/g, '$1') // italics markup
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

/** Splits a book into runs of consecutive prose paragraphs. Each run stops at
 * a heading, so no excerpt can straddle a chapter. */
function paragraphRuns(body: string): string[][] {
  const cleaned = body.replace(/\[Illustration[^\]]*\]/gs, '').replace(/\[Footnote[^\]]*\]/gs, '');
  const runs: string[][] = [];
  let run: string[] = [];
  for (const block of cleaned.split(/\n\s*\n/)) {
    if (isBreak(block)) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    run.push(unwrap(block));
  }
  if (run.length) runs.push(run);
  return runs;
}

/** Dialogue-heavy stretches read as fragments once they lose their scene, so
 * they make poor standalone excerpts even though the prose is fine. */
function tooMuchDialogue(paragraphs: string[]): boolean {
  const quoted = paragraphs.filter((p) => /^["'“‘]/.test(p)).length;
  return quoted / paragraphs.length > 0.35;
}

/** Packs consecutive paragraphs into excerpts inside the word band, cutting
 * only on paragraph boundaries so each one reads as a complete passage. */
function sliceExcerpts(runs: string[][]): string[] {
  const excerpts: string[] = [];
  for (const run of runs) {
    let buffer: string[] = [];
    let words = 0;
    const flush = () => {
      if (words >= minWords && words <= maxWords && !tooMuchDialogue(buffer)) {
        excerpts.push(buffer.join('\n\n'));
      }
      buffer = [];
      words = 0;
    };
    for (const paragraph of run) {
      const size = wordCount(paragraph);
      if (size > maxWords) {
        flush();
        continue; // a single paragraph over the ceiling cannot be cut cleanly
      }
      if (words + size > maxWords) flush();
      buffer.push(paragraph);
      words += size;
      if (words >= minWords) flush();
    }
    flush();
  }
  return excerpts;
}

/** Evenly spaced rather than head-of-book, so a work contributes passages
 * from its whole length instead of ten variations on its opening. */
function spread<T>(items: T[], want: number): T[] {
  if (items.length <= want) return items;
  const stride = items.length / want;
  return Array.from({ length: want }, (_, i) => items[Math.floor(i * stride)]);
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

mkdirSync(outDir, { recursive: true });
const sidecar = path.join(outDir, 'provenance.jsonl');
// Re-slicing leaves orphaned excerpts behind, so a re-run clears the corpus
// but never the download cache that lives alongside it.
if (values.clean) {
  for (const name of readdirSync(outDir)) {
    if (name.endsWith('.md') || name === 'provenance.jsonl') rmSync(path.join(outDir, name));
  }
}

const perWork = Math.ceil(total / WORKS.length);
const pool: { work: Work; excerpt: string }[] = [];

for (const work of WORKS) {
  try {
    const excerpts = sliceExcerpts(paragraphRuns(stripBoilerplate(await fetchBook(work))));
    const picked = spread(excerpts, perWork);
    for (const excerpt of picked) pool.push({ work, excerpt });
    console.log(`${work.author} — ${work.title}: ${picked.length} of ${excerpts.length} candidates`);
  } catch (error) {
    console.error(`${work.title}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Interleave by work so a truncated corpus stays balanced across authors
// rather than ending mid-alphabet.
const byWork = new Map<number, { work: Work; excerpt: string }[]>();
for (const item of pool) {
  const bucket = byWork.get(item.work.id) ?? [];
  bucket.push(item);
  byWork.set(item.work.id, bucket);
}
const interleaved: { work: Work; excerpt: string }[] = [];
for (let round = 0; interleaved.length < pool.length; round += 1) {
  for (const bucket of byWork.values()) if (bucket[round]) interleaved.push(bucket[round]);
}

const seen = new Set<string>();
const counters = new Map<number, number>();
let kept = 0;
for (const { work, excerpt } of interleaved) {
  if (kept >= total) break;
  const key = excerpt.slice(0, 300);
  if (seen.has(key)) continue;
  seen.add(key);
  const index = (counters.get(work.id) ?? 0) + 1;
  counters.set(work.id, index);
  const name = `${slug(work.author)}-${work.id}-${String(index).padStart(3, '0')}.md`;
  writeFileSync(path.join(outDir, name), `${excerpt}\n`, 'utf8');
  appendFileSync(
    sidecar,
    `${JSON.stringify({
      file: name,
      author: work.author,
      title: work.title,
      gutenbergId: work.id,
      url: bookUrl(work.id),
      textUrl: textUrl(work.id),
      words: wordCount(excerpt),
    })}\n`,
  );
  kept += 1;
}

console.log(`wrote ${kept} excerpts from ${counters.size} works to ${outDir}`);
