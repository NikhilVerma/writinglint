/**
 * Builds the analysis Context from nlpgraph's dependency parse.
 *
 * nlpgraph 0.3.0 reports token and sentence offsets as DOCUMENT-GLOBAL UTF-8
 * byte offsets into the exact text passed to `parse()`. So we build one
 * byte→char converter over the whole document and index directly — no sentence
 * re-anchoring, no drift. `text.slice(tok.start, tok.end)` is byte-exact.
 */
import type { ParsedSentence } from 'nlpgraph';
import { byteToChar, makeSentence } from './graph.js';
import type { Context, Sentence, Tok } from './types.js';

/** Minimal parser surface we depend on (Node `NlpGraph` and browser `NlpGraph`). */
export interface Parser {
  parse(text: string): Promise<ParsedSentence[]>;
}

/** Parse `text` and assemble the Context. */
export async function buildContext(text: string, parser: Parser): Promise<Context> {
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
    sentences.push({ text: ps.text, start, end, dep, words });
  });

  return { text, sentences, tokens };
}
