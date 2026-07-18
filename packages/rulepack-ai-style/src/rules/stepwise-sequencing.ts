/**
 * Formulaic stepwise sequencing — expository clauses narrated as "X then Y".
 *
 * "Then" is useful when time or order matters. Generated prose also uses it to
 * make a simple relationship sound like a process: "Deterministic rules then
 * flag the pattern" or "The parser maps the sentence, then the rules flag it."
 *
 * We match the dependency shape rather than the word alone: `then` must modify
 * a verb with an explicit nominal subject. That avoids imperatives ("Run this,
 * then deploy") and shared-subject chronology ("She ate, then left"). The small
 * adjacent-token fallback covers occasional attachment errors from the compact
 * parser while preserving the same NOUN + then + VERB shape.
 */
import { byId, childrenOf, defineRule, lower, type DepSentence, type DepToken } from 'writinglint-core';

interface Match {
  sentence: DepSentence;
  tokens: DepToken[];
}

type VerbToken = DepToken & { upos: 'VERB' | 'AUX' };

const isVerb = (token: DepToken | undefined): token is VerbToken =>
  token?.upos === 'VERB' || token?.upos === 'AUX';

const isSubject = (token: DepToken): boolean =>
  token.deprel === 'nsubj' || token.deprel.startsWith('nsubj:')
  || token.deprel === 'csubj' || token.deprel.startsWith('csubj:');

function candidateFor(sentence: DepSentence, then: DepToken): DepToken[] | undefined {
  const adjacentFallback = (): DepToken[] | undefined => {
    const previous = byId(sentence, then.id - 1);
    const following = byId(sentence, then.id + 1);
    const predicateLike = isVerb(following)
      || (following != null
        && (following.deprel === 'root'
          || following.deprel === 'conj'
          || following.deprel === 'compound'
          || following.deprel === 'parataxis'));
    return previous?.upos === 'NOUN' && predicateLike
      ? [previous, then, following]
      : undefined;
  };

  let verb = byId(sentence, then.head);
  if (!isVerb(verb)) {
    // The distilled parser occasionally attaches the subject to a later noun.
    // Only recover the very local NOUN + then + VERB pattern; do not turn this
    // into a text regex that would match every use of "then".
    return adjacentFallback();
  }

  const subject = childrenOf(sentence, verb.id).find(isSubject);
  if (!subject || subject.upos !== 'NOUN') return adjacentFallback();

  // Highlight only the clause's structural spine. Dependents such as long
  // object lists make the diagnostic harder to locate in editors.
  return [subject, then, verb].sort((a, b) => a.id - b.id);
}

export const stepwiseSequencing = defineRule({
  meta: {
    name: 'stepwise-sequencing',
    category: 'conjunctions',
    docs: {
      description: 'Formulaic “X then Y” sequencing where “then” narrates an explanation rather than a real order.',
    },
  },
  create(ctx) {
    const matches: Match[] = [];
    return {
      Document(doc) {
        for (const { dep: sentence } of doc.sentences) {
          for (const then of sentence.tokens) {
            if (lower(then) !== 'then' || (then.upos !== 'ADV' && then.deprel !== 'advmod')) continue;
            const tokens = candidateFor(sentence, then);
            if (tokens) matches.push({ sentence, tokens });
          }
        }

        const confidence = matches.length >= 4 ? 'high' : matches.length >= 2 ? 'medium' : 'low';
        for (const match of matches) {
          ctx.report({
            sentence: match.sentence,
            tokens: match.tokens,
            confidence,
            message: matches.length === 1
              ? 'Possible formulaic “X then Y” sequencing. Keep “then” only when the order itself matters.'
              : `“X then Y” sequencing repeats ${matches.length} times, giving the explanation a mechanical cadence. State each relationship directly unless order matters.`,
          });
        }
      },
    };
  },
});
