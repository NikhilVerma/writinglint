/**
 * The Document model — the parse-once artifact every rule reads.
 *
 * Parsers report document-global UTF-16 offsets into the exact text passed to
 * `parse()`, so highlights can be used directly with `text.slice()`.
 */
import type { ParsedSentence } from './parse-types.js';
import { makeSentence, type DepSentence } from './graph.js';
import type { Parser } from './parser.js';

/** A word token with GLOBAL char offsets into the original text (lexical rules). */
export interface Tok {
  text: string;
  /** lower-cased text, for matching. */
  lower: string;
  /** Universal POS tag from the parse ('NOUN', 'VERB', 'PUNCT', …). */
  upos: string;
  start: number;
  end: number;
  /** Index of the sentence this token belongs to. */
  sentence: number;
}

/** A sentence: its global char anchor, its dependency graph, and word tokens. */
export interface Sentence {
  text: string;
  start: number;
  end: number;
  /** Position of this sentence in the document. */
  index: number;
  /** Dependency graph for structural rules. */
  dep: DepSentence;
  /** Non-punctuation tokens with global char offsets (for lexical rules). */
  words: Tok[];
}

/** A blank-line-delimited prose block used for cross-sentence evidence. */
export interface Paragraph {
  text: string;
  start: number;
  end: number;
  index: number;
  sentences: Sentence[];
}

/** A parsed document: the text, its sentences, and a flat token stream. */
export interface Document {
  text: string;
  sentences: Sentence[];
  /** Blank-line-delimited blocks for paragraph-level rules and aggregation. */
  paragraphs: Paragraph[];
  /** Flat word-token stream across the whole document (lexical convenience). */
  tokens: Tok[];
}

/** Parse `text` with a loaded parser and assemble the Document. */
export async function buildDocument(text: string, parser: Parser): Promise<Document> {
  const parsed = await parser.parse(text);
  const sentences: Sentence[] = [];
  const tokens: Tok[] = [];

  parsed.forEach((ps: ParsedSentence, sIndex: number) => {
    const dep = makeSentence(ps);

    // Sentence source range (doc-global). Fall back to token span if absent.
    const first = ps.tokens[0];
    const last = ps.tokens[ps.tokens.length - 1];
    const start = ps.start ?? first?.start ?? 0;
    const end = ps.end ?? last?.end ?? 0;

    const words: Tok[] = ps.tokens
      .filter((t) => t.upos !== 'PUNCT' && t.upos !== 'SYM')
      .map((t) => ({
        text: t.form,
        lower: t.form.toLowerCase(),
        upos: t.upos,
        start: t.start,
        end: t.end,
        sentence: sIndex,
      }));

    tokens.push(...words);
    sentences.push({ text: ps.text, start, end, index: sIndex, dep, words });
  });

  return { text, sentences, paragraphs: buildParagraphs(text, sentences), tokens };
}

function buildParagraphs(text: string, sentences: Sentence[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const boundaries = [...text.matchAll(/\n[\t ]*\n/g)];
  let segmentStart = 0;
  for (let index = 0; index <= boundaries.length; index++) {
    const segmentEnd = index < boundaries.length ? boundaries[index]!.index : text.length;
    const segment = text.slice(segmentStart, segmentEnd);
    const leading = segment.search(/\S/);
    if (leading !== -1) {
      const trailing = segment.length - segment.trimEnd().length;
      const start = segmentStart + leading;
      const end = segmentEnd - trailing;
      paragraphs.push({
        text: text.slice(start, end),
        start,
        end,
        index: paragraphs.length,
        sentences: sentences.filter((sentence) => sentence.end > start && sentence.start < end),
      });
    }
    const boundary = boundaries[index];
    segmentStart = boundary ? boundary.index + boundary[0].length : text.length;
  }
  return paragraphs;
}
