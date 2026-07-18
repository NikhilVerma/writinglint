/**
 * Hedging seesaw — the relentless-balance discourse tell: every claim opens
 * with a concession ("While X, …") or pivots straight after ("However, …",
 * "That said, …"). One concession is judgment; a document that seesaws every
 * few sentences is a model refusing to take a position.
 *
 * Density-gated on SENTENCE-INITIAL markers only (mid-sentence concessives are
 * ordinary prose): fires at ≥3 seesaw openers AND ≥0.8 per 100 words. On the
 * private eval corpus that flags 0% of human documents — this rule targets the
 * balanced-essay register, and errs entirely against accusing a human.
 */
import { defineRule } from 'writinglint-core';

const LEAD = `["'“‘(]*\\s*`;
const CONCESSIVE = new RegExp(`^${LEAD}(while|although|though|despite|even though)\\b`, 'i');
const PIVOT = new RegExp(
  `^${LEAD}(however|on the other hand|that said|that being said|at the same time|to be fair|conversely|nevertheless|nonetheless)\\b`,
  'i',
);

const MIN_HITS = 3;
const MIN_PER_100_WORDS = 0.8;

export const hedgingSeesaw = defineRule({
  meta: {
    name: 'hedging-seesaw',
    category: 'balance',
    docs: { description: 'Relentless “While X… However, Y” balancing — a position never taken.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        const hits: { start: number; end: number }[] = [];
        for (const s of doc.sentences) {
          const m = CONCESSIVE.exec(s.text) ?? PIVOT.exec(s.text);
          if (!m) continue;
          const lead = m[0].length - m[1].length;
          hits.push({ start: s.start + lead, end: s.start + lead + m[1].length });
        }
        const words = Math.max(1, doc.tokens.length);
        if (hits.length < MIN_HITS || (hits.length / words) * 100 < MIN_PER_100_WORDS) return;
        for (const h of hits)
          ctx.report({
            span: h,
            message:
              `Hedging seesaw (${hits.length} sentence-opening concessions/pivots) — ` +
              'every claim is balanced away. Take the position, or cut the counterweight.',
          });
      },
    };
  },
});
