import { childrenByRel, defineRule, lower, subtree, type DepSentence } from 'writinglint-core';

// Kept deliberately narrow. These abstractions frequently receive human agency
// in generic generated prose; ordinary concrete subjects are not flagged.
const ABSTRACT_SUBJECTS = new Set([
  'data', 'market', 'decision', 'culture', 'conversation', 'research', 'evidence',
  'report', 'analysis', 'technology', 'innovation', 'landscape', 'framework',
]);
const HUMAN_ACTIONS = new Set([
  'tell', 'tells', 'reward', 'rewards', 'decide', 'decides', 'believe', 'believes',
  'want', 'wants', 'refuse', 'refuses', 'choose', 'chooses', 'promise', 'promises',
  'argue', 'argues', 'celebrate', 'celebrates', 'embrace', 'embraces',
]);

export const falseAgency = defineRule({
  meta: {
    name: 'false-agency',
    category: 'agency',
    docs: { description: 'An abstraction is made to act like a person instead of naming the actor.' },
  },
  create(ctx) {
    return {
      Sentence(sentence) {
        const s: DepSentence = sentence.dep;
        for (const verb of s.tokens) {
          if (verb.upos !== 'VERB' || !HUMAN_ACTIONS.has(lower(verb))) continue;
          const subject = childrenByRel(s, verb.id, 'nsubj').find(
            (token) => token.upos === 'NOUN' && ABSTRACT_SUBJECTS.has(lower(token)),
          );
          if (!subject) continue;
          ctx.report({
            tokens: [...subtree(s, subject.id), ...subtree(s, verb.id)],
            sentence: s,
            message: 'False agency gives an abstraction a human action. Name who interpreted, chose, or acted.',
          });
        }
      },
    };
  },
});
