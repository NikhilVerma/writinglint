import { defineRule, lower, referenceDistance } from 'writinglint-core';

/** Two sentences back is still an easy hop. Past that the reader has to search. */
const MAX_EASY_DISTANCE = 2;

// "It" often stands for nothing, as in "It is hard to say" or "It turns out".
const DUMMY_IT_RE = /^(?:and |but |so )?it(?:'s| is| was| would be| will be| may be| might be| can be| could be| isn't| wasn't)? ?(?:\w+ )?(?:\w+ )?(?:to|that|who|when|if|how|why|what|whether)\b|^(?:and |but |so )?it (?:seems?|appears?|turns? out|takes?|depends|helps?|matters?|follows|means|doesn't|didn't|does|did)\b/iu;

/** A sentence that opens with "it" or "they" long after the noun it depends on. */
export const distantPronoun = defineRule({
  meta: {
    name: 'distant-pronoun',
    category: 'load',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['sentence-boundaries', 'tokens', 'part-of-speech', 'dependencies'] },
    docs: {
      description: 'A sentence opens with "it" or "they" several sentences after the noun it refers to, so the reader must search for the meaning.',
    },
  },
  create(context) {
    return {
      Document(document) {
        for (const sentence of document.sentences) {
          const opener = sentence.dep.tokens.find((token) => token.upos !== 'PUNCT' && token.upos !== 'CCONJ');
          if (!opener || !['it', 'they'].includes(lower(opener)) || !opener.deprel.startsWith('nsubj')) continue;
          if (DUMMY_IT_RE.test(sentence.text)) continue;
          // No match at all usually means generic "they", not a lost reference.
          const distance = referenceDistance(document, sentence, opener);
          if (distance === undefined || distance <= MAX_EASY_DISTANCE) continue;
          context.report({
            span: { start: opener.start, end: opener.end },
            message: `The noun this refers to is ${distance} sentences back. Name it again so the reader doesn't have to search for it.`,
            evidence: [{ kind: 'distant-pronoun', data: { sentencesBack: distance } }],
          });
        }
      },
    };
  },
});
