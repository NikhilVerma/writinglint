/**
 * The Document model — the parse-once artifact every rule reads.
 *
 * nlpgraph 0.3.0 reports token and sentence offsets as DOCUMENT-GLOBAL UTF-8
 * byte offsets into the exact text passed to `parse()`. So we build one
 * byte→char converter over the whole document and index directly — no sentence
 * re-anchoring, no drift. `text.slice(tok.start, tok.end)` is byte-exact.
 */
import type { ParsedSentence } from 'nlpgraph';
import { byteToChar, makeSentence, type DepSentence } from './graph.js';
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
  /** Dependency graph for structural rules (from nlpgraph's parser). */
  dep: DepSentence;
  /** Non-punctuation tokens with global char offsets (for lexical rules). */
  words: Tok[];
}

/** A parsed document: the text, its sentences, and a flat token stream. */
export interface Document {
  text: string;
  sentences: Sentence[];
  /** Flat word-token stream across the whole document (lexical convenience). */
  tokens: Tok[];
}

/** Parse `text` with a loaded parser and assemble the Document. */
export async function buildDocument(text: string, parser: Parser): Promise<Document> {
  const parsed = await parser.parse(text);
  const toGlobal = byteToChar(text);
  const sentences: Sentence[] = [];
  const tokens: Tok[] = [];

  parsed.forEach((ps: ParsedSentence, sIndex: number) => {
    const dep = makeSentence(ps, toGlobal);

    // Sentence source range (doc-global). Fall back to token span if absent.
    const first = ps.tokens[0];
    const last = ps.tokens[ps.tokens.length - 1];
    const start = toGlobal(ps.start ?? first?.start ?? 0);
    const end = toGlobal(ps.end ?? last?.end ?? 0);

    const words: Tok[] = ps.tokens
      .filter((t) => t.upos !== 'PUNCT' && t.upos !== 'SYM')
      .map((t) => ({
        text: t.form,
        lower: t.form.toLowerCase(),
        upos: t.upos,
        start: toGlobal(t.start),
        end: toGlobal(t.end),
        sentence: sIndex,
      }));

    tokens.push(...words);
    sentences.push({ text: ps.text, start, end, index: sIndex, dep, words });
  });

  return { text, sentences, tokens };
}
