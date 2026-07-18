import { childrenByRel, childrenOf, defineRule, lower, subtree, type DepSentence } from 'writinglint-core';

// Kept deliberately narrow. These abstractions frequently receive human agency
// in generic generated prose; ordinary concrete subjects are not flagged.
const ABSTRACT_SUBJECTS = new Set([
  'data', 'market', 'decision', 'culture', 'conversation', 'research', 'evidence',
  'report', 'analysis', 'technology', 'innovation', 'landscape', 'framework',
  'complaint', 'feedback', 'request', 'problem', 'issue', 'answer', 'solution',
]);
const HUMAN_ACTIONS = new Set([
  'tell', 'tells', 'reward', 'rewards', 'decide', 'decides', 'believe', 'believes',
  'want', 'wants', 'refuse', 'refuses', 'choose', 'chooses', 'promise', 'promises',
  'argue', 'argues', 'celebrate', 'celebrates', 'embrace', 'embraces',
]);
const TRANSFORMATIONS = new Set([
  'become', 'becomes', 'became', 'emerge', 'emerges', 'emerged',
  'transform', 'transforms', 'transformed', 'evolve', 'evolves', 'evolved',
]);
const STRONG_TRANSFORMATION_TARGETS = new Set([
  'action', 'answer', 'fix', 'insight', 'plan', 'result', 'solution', 'strategy',
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
          const action = lower(verb);
          if (verb.upos !== 'VERB' || (!HUMAN_ACTIONS.has(action) && !TRANSFORMATIONS.has(action))) continue;
          const subject = childrenByRel(s, verb.id, 'nsubj').find(
            (token) => token.upos === 'NOUN' && ABSTRACT_SUBJECTS.has(lower(token)),
          );
          if (!subject) continue;
          const transformation = TRANSFORMATIONS.has(action);
          const verbChildren = childrenOf(s, verb.id);
          if (!transformation && !verbChildren.some((token) =>
            token.deprel === 'obj' || token.deprel === 'iobj' || token.deprel === 'ccomp'
            || token.deprel === 'xcomp' || token.deprel === 'obl'
          )) continue;
          const target = verbChildren.find((token) =>
            (token.upos === 'NOUN' || token.upos === 'PROPN') && STRONG_TRANSFORMATION_TARGETS.has(lower(token)),
          );
          ctx.report({
            tokens: subtree(s, verb.id),
            sentence: s,
            confidence: transformation && !target ? 'low' : 'medium',
            message: transformation
              ? 'False agency makes an abstraction appear to transform itself. Name the actor or mechanism that changed it.'
              : 'False agency gives an abstraction a human action. Name who interpreted, chose, or acted.',
          });
        }
      },
    };
  },
});
