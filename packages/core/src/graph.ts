/**
 * Dependency-graph helpers over WritingLint's parser-neutral UD output.
 *
 * This is the engine the detector judges writing with: the Wikipedia "signs of
 * AI writing" that are *constructions* (significance inflation, parallelism,
 * triads, participial appendages, vague attribution) are matched here as SHAPES
 * in the dependency graph — `nsubj`, `conj`, `amod`, `advcl`, `case` — so any
 * words can fill the slots. No phrase lists.
 *
 * Parsers provide 1-indexed tokens (`id`, `head`; head 0 = ROOT) with
 * document-global UTF-16 offsets. We add graph indices for rule authors.
 */
import type { DepToken, ParsedSentence } from './parse-types.js';

/** A parsed sentence plus its graph indices. */
export interface DepSentence {
  text: string;
  tokens: DepToken[];
  /** children.get(headId) → dependents of that token. */
  children: Map<number, DepToken[]>;
}

/** Convert a document-global UTF-8 byte offset to a UTF-16 index. @deprecated */
export function byteToChar(s: string): (byte: number) => number {
  const prefixByte: number[] = [0];
  const prefixChar: number[] = [0];
  let bytes = 0;
  for (let i = 0; i < s.length; ) {
    const cp = s.codePointAt(i)!;
    bytes += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    i += cp > 0xffff ? 2 : 1;
    prefixByte.push(bytes);
    prefixChar.push(i);
  }
  return (byte: number): number => {
    let lo = 0;
    let hi = prefixByte.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (prefixByte[mid] < byte) lo = mid + 1;
      else hi = mid;
    }
    return prefixChar[lo];
  };
}

/** Wrap a parsed sentence with graph indices. */
export function makeSentence(ps: ParsedSentence): DepSentence {
  const children = new Map<number, DepToken[]>();
  for (const t of ps.tokens) {
    const arr = children.get(t.head);
    if (arr) arr.push(t);
    else children.set(t.head, [t]);
  }
  return { text: ps.text, tokens: ps.tokens, children };
}

// ── graph queries ────────────────────────────────────────────────────────────

export const childrenOf = (s: DepSentence, id: number): DepToken[] => s.children.get(id) ?? [];

export const root = (s: DepSentence): DepToken | undefined =>
  s.tokens.find((t) => t.head === 0);

export const byId = (s: DepSentence, id: number): DepToken | undefined =>
  id >= 1 && id <= s.tokens.length && s.tokens[id - 1]?.id === id
    ? s.tokens[id - 1]
    : s.tokens.find((t) => t.id === id);

/** First child of `id` whose deprel is `rel` (or `rel:*`). */
export function child(s: DepSentence, id: number, rel: string): DepToken | undefined {
  return childrenOf(s, id).find((t) => t.deprel === rel || t.deprel.startsWith(`${rel}:`));
}

/** All children of `id` with deprel `rel` (or `rel:*`). */
export function childrenByRel(s: DepSentence, id: number, rel: string): DepToken[] {
  return childrenOf(s, id).filter((t) => t.deprel === rel || t.deprel.startsWith(`${rel}:`));
}

/** Does `id` have any child with deprel `rel`? */
export const hasChild = (s: DepSentence, id: number, rel: string): boolean =>
  childrenOf(s, id).some((t) => t.deprel === rel || t.deprel.startsWith(`${rel}:`));

/** All tokens in the subtree rooted at `id` (inclusive). */
export function subtree(s: DepSentence, id: number): DepToken[] {
  const out: DepToken[] = [];
  const stack = [id];
  const visited = new Set<number>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const tok = byId(s, cur);
    if (tok) out.push(tok);
    for (const c of childrenOf(s, cur)) stack.push(c.id);
  }
  return out.sort((a, b) => a.id - b.id);
}

/** Global char span covering a set of tokens (min start … max end). */
export function spanOf(_s: DepSentence, toks: DepToken[]): { start: number; end: number } {
  let start = Infinity;
  let end = -Infinity;
  for (const t of toks) {
    start = Math.min(start, t.start);
    end = Math.max(end, t.end);
  }
  return { start, end };
}

export const isGerund = (t: DepToken): boolean => /[a-z]ing$/i.test(t.form);
export const lower = (t: DepToken): string => t.form.toLowerCase();
