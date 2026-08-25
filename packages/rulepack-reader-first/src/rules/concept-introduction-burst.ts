import { defineRule, type Tok } from 'writinglint-core';
import { buildReadingTrace, canonicalEntityKey } from '../reading-trace.js';

const MIN_RECURRING_USES = 2;
const WARNING_CONCEPTS = 12;
const ERROR_CONCEPTS = 18;
const GENERIC_NOUNS = new Set([
  'example', 'fact', 'kind', 'one', 'part', 'point', 'reason', 'result', 'section',
  'thing', 'time', 'type', 'way', 'word', 'work',
]);

function termFor(token: Tok): string | undefined {
  if (token.upos !== 'NOUN' && token.upos !== 'PROPN') return undefined;
  const term = canonicalEntityKey(token);
  if (term.length < 3 || GENERIC_NOUNS.has(term) || !/^[a-z][a-z'-]*$/u.test(term)) return undefined;
  return term;
}

/** A reading unit that asks the reader to learn many recurring concepts at once. */
export const conceptIntroductionBurst = defineRule({
  meta: {
    name: 'concept-introduction-burst',
    category: 'load',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['tokens', 'part-of-speech'], regions: ['paragraph'] },
    docs: {
      description: 'A passage introduces many recurring concepts before the reader has time to absorb them.',
    },
  },
  create(context) {
    return {
      Document(document) {
        const totals = new Map<string, number>();
        for (const token of document.tokens) {
          const term = termFor(token);
          if (term) totals.set(term, (totals.get(term) ?? 0) + 1);
        }

        const seen = new Set<string>();
        for (const unit of buildReadingTrace(document).units) {
          const introduced = new Map<string, Tok>();
          for (const token of unit.tokens) {
            const term = termFor(token);
            if (!term || seen.has(term) || (totals.get(term) ?? 0) < MIN_RECURRING_USES) continue;
            if (!introduced.has(term)) introduced.set(term, token);
          }
          for (const term of introduced.keys()) seen.add(term);
          if (introduced.size < WARNING_CONCEPTS) continue;

          const terms = [...introduced.keys()];
          context.report({
            span: { start: unit.start, end: unit.end },
            confidence: introduced.size >= ERROR_CONCEPTS ? 'high' : 'medium',
            message: `This passage introduces ${introduced.size} concepts that the document expects the reader to remember. Pace the terminology and introduce each concept closer to where it becomes useful.`,
            evidence: [{
              kind: 'concept-introduction-burst',
              data: {
                concepts: introduced.size,
                terms: terms.join(', '),
              },
            }],
          });
        }
      },
    };
  },
});
