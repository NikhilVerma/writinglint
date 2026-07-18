import { childrenOf, defineRule, lower, subtree, type DepSentence } from 'writinglint-core';

// Passive voice is not itself slop. Ordinary actorless passives are low-confidence
// editorial candidates; actions that conceal accountability are promoted.
const ACCOUNTABILITY_ACTIONS = new Set([
  'approved', 'blamed', 'censored', 'changed', 'chosen', 'concealed', 'decided',
  'denied', 'determined', 'dismissed', 'excluded', 'forced', 'hidden', 'ignored',
  'made', 'omitted', 'overlooked', 'punished', 'raised', 'rejected', 'reported',
  'suppressed',
]);

/** Passive clauses with no explicit `by`-agent: grammatical, but often evasive. */
export const passiveActorHiding = defineRule({
  meta: {
    name: 'passive-actor-hiding',
    category: 'agency',
    docs: { description: 'A passive clause hides who performed the action.' },
  },
  create(ctx) {
    return {
      Sentence(sentence) {
        const s: DepSentence = sentence.dep;
        for (const verb of s.tokens) {
          if (verb.upos !== 'VERB') continue;
          const children = childrenOf(s, verb.id);
          const passiveSubject = children.find((token) => token.deprel === 'nsubj:pass');
          const passiveAux = children.some((token) => token.deprel === 'aux:pass');
          if (!passiveSubject || !passiveAux) continue;
          if (lower(verb) === 'made' && lower(passiveSubject) === 'it') continue;
          const hasAgent = children.some(
            (token) => token.deprel === 'obl:agent' || token.deprel === 'nmod:agent',
          );
          if (hasAgent) continue;
          const hidesAccountability = ACCOUNTABILITY_ACTIONS.has(lower(verb));
          ctx.report({
            tokens: subtree(s, verb.id),
            sentence: s,
            confidence: hidesAccountability ? 'medium' : 'low',
            message: hidesAccountability
              ? 'Actorless passive voice hides who made the decision or did the work. Name the responsible person or group.'
              : 'Possible actorless passive voice. Name the actor when it would make the sentence more concrete or accountable.',
          });
        }
      },
    };
  },
});
