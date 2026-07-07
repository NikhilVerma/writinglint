/**
 * Participial appendage — a sentence-final `-ing` clause (`advcl`/`acl`) hung off
 * the main clause after a comma, filled by an editorialising gerund. The AI
 * "superficial analysis" tell: "…, showcasing its heritage".
 */
import { defineRule, isGerund, lower, subtree, type DepSentence } from '@writinglint/core';

// Editorialising gerunds — the semantic half of the tell (vacuous significance).
// "…, showcasing its heritage" vs human "…, trying to fix it".
const EDITORIAL_GERUND = new Set([
  'showcasing', 'highlighting', 'underscoring', 'emphasizing', 'emphasising', 'reflecting',
  'symbolizing', 'symbolising', 'cementing', 'solidifying', 'reinforcing', 'exemplifying',
  'demonstrating', 'fostering', 'cultivating', 'signaling', 'signalling', 'embodying',
  'epitomizing', 'epitomising', 'illustrating', 'affirming', 'reshaping', 'redefining',
]);

export const participialAppendage = defineRule({
  meta: {
    name: 'participial-appendage',
    category: 'significance',
    docs: { description: 'Trailing “-ing” clause that editorialises the main clause.' },
  },
  create(ctx) {
    return {
      Sentence(sentence) {
        const s: DepSentence = sentence.dep;
        for (const g of s.tokens) {
          if (g.deprel !== 'advcl' && g.deprel !== 'acl') continue;
          if (g.upos !== 'VERB' || !isGerund(g)) continue;
          if (!EDITORIAL_GERUND.has(lower(g))) continue; // editorialising, not narrative
          if (g.id <= g.head) continue; // must trail its head
          const before = s.tokens[g.id - 2]; // token immediately before g
          if (!before || before.form !== ',') continue;
          ctx.report({
            tokens: subtree(s, g.id),
            sentence: s,
            message:
              'Trailing “-ing” clause that editorialises the main clause — a hallmark of AI summary prose.',
          });
        }
      },
    };
  },
});
