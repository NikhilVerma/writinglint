import { childrenOf, root as rootOf, type Document, type Sentence } from 'writinglint-core';

const SUBJECT_RELATIONS = new Set(['csubj', 'expl', 'nsubj']);
const SUBJECTLESS_PARTICIPLES = new Set([
  'built', 'chosen', 'done', 'found', 'given', 'grouped', 'kept', 'made',
  'shown', 'unchanged', 'verified', 'written',
]);

const relationIs = (relation: string, choices: ReadonlySet<string>): boolean =>
  [...choices].some((choice) => relation === choice || relation.startsWith(`${choice}:`));

export function hasSubject(sentence: Sentence, tokenId: number): boolean {
  return childrenOf(sentence.dep, tokenId).some((token) => relationIs(token.deprel, SUBJECT_RELATIONS));
}

export function hasFiniteClauseBefore(sentence: Sentence, globalOffset: number): boolean {
  return sentence.dep.tokens.some((token) => {
    if (token.end > globalOffset || (token.upos !== 'VERB' && token.upos !== 'AUX')) return false;
    const children = childrenOf(sentence.dep, token.id);
    return hasSubject(sentence, token.id)
      || children.some((child) => child.end <= globalOffset && (child.deprel === 'aux' || child.deprel.startsWith('aux:')));
  });
}

export function isFragmentSentence(sentence: Sentence): boolean {
  if (sentence.words.length < 2) return false;
  const root = rootOf(sentence.dep);
  if (!root || hasSubject(sentence, root.id)) return false;
  const children = childrenOf(sentence.dep, root.id);
  if (children.some((child) => child.deprel === 'cop' || child.deprel.startsWith('cop:'))) return false;
  if (root.upos === 'NOUN' || root.upos === 'PROPN' || root.upos === 'ADJ' || root.upos === 'ADV') return true;
  if (root.upos !== 'VERB') return false;
  const form = root.form.toLowerCase();
  return form.endsWith('ed')
    || form.endsWith('en')
    || form.endsWith('s')
    || SUBJECTLESS_PARTICIPLES.has(form);
}

export function overlapsRegion(document: Document, sentence: Sentence, roles: ReadonlySet<string>): boolean {
  return document.regions.some((region) =>
    roles.has(region.role) && region.end > sentence.start && region.start < sentence.end);
}

export function linePrefix(document: Document, sentence: Sentence): string {
  const lineStart = document.text.lastIndexOf('\n', Math.max(0, sentence.start - 1)) + 1;
  return document.text.slice(lineStart, sentence.start);
}
