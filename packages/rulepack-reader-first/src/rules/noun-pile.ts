import { childrenOf, defineRule, type DepSentence, type DepToken } from 'writinglint-core';

const MIN_COMPOUNDS = 3;
const WORD_RE = /^[a-z][a-z-]*$/;

/** A chain of four or more common nouns that hides their relationships. */
export const nounPile = defineRule({
  meta: {
    name: 'noun-pile',
    category: 'jargon',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['tokens', 'part-of-speech', 'dependencies'] },
    docs: {
      description: 'Four or more common nouns are stacked together without showing how they relate.',
    },
  },
  create(context) {
    return {
      Sentence(sentence) {
        const parsed: DepSentence = sentence.dep;
        if (!parsed.tokens.some((token) => token.upos === 'VERB' || token.upos === 'AUX')) return;
        for (const head of parsed.tokens) {
          if (head.upos !== 'NOUN' || !WORD_RE.test(head.form)) continue;
          const members: DepToken[] = [];
          const stack = [head.id];
          let clean = true;
          while (stack.length) {
            const id = stack.pop()!;
            for (const child of childrenOf(parsed, id)) {
              if (!child.deprel.startsWith('compound')) continue;
              if (!WORD_RE.test(child.form)) {
                clean = false;
                break;
              }
              members.push(child);
              stack.push(child.id);
            }
            if (!clean) break;
          }
          if (!clean || members.length < MIN_COMPOUNDS) continue;
          const pile = [...members, head].sort((left, right) => left.id - right.id);
          context.report({
            tokens: pile,
            sentence: parsed,
            message: `${pile.length} nouns are stacked around “${head.form}”. Add a verb or preposition to show how the ideas relate.`,
          });
        }
      },
    };
  },
});
