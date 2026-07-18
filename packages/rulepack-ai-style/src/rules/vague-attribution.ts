/**
 * Vague attribution — a bare (determiner-less) common-noun subject that heads a
 * clause of assertion (`ccomp`) via a saying-verb: "Experts argue that …",
 * "Studies suggest that …". The "who says so?" is generic; detected structurally
 * (no `det`/`nmod:poss` on the nsubj) with a small saying-verb seed.
 */
import { childrenByRel, defineRule, hasChild, lower, subtree, type DepSentence } from 'writinglint-core';
import { VAGUE_PHRASES } from '../lexicons.js';
import { compilePhrases, normalize } from './_lexicon.js';

// Verbs of saying/attribution — the semantic half of vague attribution (the
// structural half is a bare, generic subject). "features mean that …" isn't
// weasel; "experts argue that …" is.
const SAYING_VERB = new Set([
  'argue', 'argues', 'argued', 'say', 'says', 'said', 'claim', 'claims', 'claimed', 'suggest',
  'suggests', 'suggested', 'contend', 'contends', 'maintain', 'maintains', 'assert', 'asserts',
  'insist', 'insists', 'believe', 'believes', 'report', 'reports', 'reported', 'observe',
  'observes', 'observed', 'agree', 'agrees', 'warn', 'warns', 'predict', 'predicts', 'indicate',
  'indicates', 'reveal', 'reveals', 'show', 'shows', 'conclude', 'concludes', 'posit', 'posits',
  'allege', 'alleges', 'acknowledge', 'acknowledges', 'note', 'notes',
]);
const GENERIC_SOURCES = new Set([
  'analysts', 'commentators', 'critics', 'experts', 'observers', 'people',
  'reports', 'research', 'researchers', 'scholars', 'sources', 'studies',
]);
const VAGUE_RE = compilePhrases(VAGUE_PHRASES);

export const vagueAttribution = defineRule({
  meta: {
    name: 'vague-attribution',
    category: 'vague',
    docs: { description: 'A bare, generic subject asserting a “that …” clause. Name who, or cut it.' },
  },
  create(ctx) {
    return {
      Sentence(sentence) {
        const s: DepSentence = sentence.dep;
        const strongSpans: Array<{ start: number; end: number }> = [];
        for (const v of s.tokens) {
          if (v.upos !== 'VERB') continue;
          if (!hasChild(s, v.id, 'ccomp')) continue;
          if (!SAYING_VERB.has(lower(v))) continue; // an attribution verb, not "features mean …"
          const subj = childrenByRel(s, v.id, 'nsubj').find(
            (n) => n.upos === 'NOUN' && GENERIC_SOURCES.has(lower(n))
              && !hasChild(s, n.id, 'det') && !hasChild(s, n.id, 'nmod:poss'),
          );
          if (!subj) continue;
          const tokens = [...subtree(s, subj.id), v];
          const start = Math.min(...tokens.map((token) => token.start));
          const end = Math.max(...tokens.map((token) => token.end));
          strongSpans.push({ start, end });
          ctx.report({
            tokens,
            sentence: s,
            confidence: 'medium',
            message:
              'Unattributed claim — a bare, generic subject asserting a “that …” clause. Name who, or cut it.',
          });
        }
        for (const match of normalize(sentence.text).matchAll(VAGUE_RE)) {
          const start = sentence.start + match.index;
          const end = start + match[0].length;
          if (strongSpans.some((span) => start < span.end && end > span.start)) continue;
          ctx.report({
            span: { start, end },
            confidence: 'low',
            message: 'Possible vague attribution or overgeneralization. Name the source, quantify the group, or remove the borrowed authority.',
          });
        }
      },
    };
  },
});
