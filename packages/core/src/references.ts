/**
 * Works out how far a reader must look back to find what "it" or "they" means.
 *
 * A pronoun pointing at the sentence before is easy, because people chain two
 * sentences together without effort. The same pronoun several sentences after
 * its noun makes the reader stop and search.
 *
 * This is a distance estimate, not real pronoun resolution. It finds the nearest
 * noun that fits by number, so a closer unrelated noun can hide a real problem.
 */
import type { Document, Sentence } from './document.js';
import type { DepToken } from './parse-types.js';

const ARGUMENT_RELATION_RE = /^(?:nsubj|obj|iobj|root|csubj|appos|conj|nmod|obl|xcomp|ccomp)(?::|$)/u;
const REFERENT_NUMBER: Record<string, 'singular' | 'plural'> = {
  it: 'singular', its: 'singular', they: 'plural', them: 'plural', their: 'plural',
};
const NUMBER_NEUTRAL_NOUNS = new Set(['data', 'people', 'team', 'group', 'staff', 'media', 'company', 'user']);

/** True for "it" or "they" style words, whose meaning depends on an earlier noun. */
export function isPersonalReference(token: DepToken): boolean {
  return token.form.toLowerCase() in REFERENT_NUMBER;
}

function nounFits(token: DepToken, number: 'singular' | 'plural'): boolean {
  if (token.upos !== 'NOUN' && token.upos !== 'PROPN') return false;
  if (!ARGUMENT_RELATION_RE.test(token.deprel)) return false;
  const word = token.form.toLowerCase();
  if (NUMBER_NEUTRAL_NOUNS.has(word) || token.upos === 'PROPN') return true;
  const looksPlural = word.endsWith('s') && !/(?:ss|us|is)$/u.test(word);
  return number === 'plural' ? looksPlural : !looksPlural;
}

function refersOn(sentence: Sentence, limit: number, number: 'singular' | 'plural'): boolean {
  return sentence.dep.tokens.some((token) => token.start < limit
    && (nounFits(token, number) || REFERENT_NUMBER[token.form.toLowerCase()] === number));
}

/**
 * Counts the sentences back to the nearest possible meaning of `token`: 0 is the
 * same sentence and 1 is the sentence before. Another matching pronoun counts,
 * so "It starts. It stops." reads as a chain. Undefined means nothing fits.
 */
export function referenceDistance(document: Document, sentence: Sentence, token: DepToken): number | undefined {
  const number = REFERENT_NUMBER[token.form.toLowerCase()];
  if (!number) return undefined;
  if (sentence.dep.tokens.some((other) => other.start < token.start && nounFits(other, number))) return 0;
  for (let index = sentence.index - 1; index >= 0; index--) {
    const earlier = document.sentences[index]!;
    if (refersOn(earlier, earlier.end, number)) return sentence.index - index;
  }
  return undefined;
}
