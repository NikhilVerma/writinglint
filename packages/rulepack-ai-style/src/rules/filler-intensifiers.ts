/**
 * Filler intensifiers — genuinely, really, truly, actually, honestly. Two
 * distinct smells share the lexicon:
 *
 *  1. The stance shape: intensifier + first-person copular adjective ("I am
 *    genuinely open to both designs"). The adverb performs sincerity the plain
 *    adjective already carries — "open" does the work; "genuinely" begs to be
 *    believed. Precise graph shape, reports per instance.
 *  2. The spray: several intensifiers across a document, density-gated so
 *    ordinary conversational use never fires.
 */
import { child, defineRule, hasChild, lower, subtree, type DepSentence, type DepToken } from 'writinglint-core';

const INTENSIFIER = new Set(['genuinely', 'truly', 'really', 'actually', 'honestly', 'absolutely', 'incredibly']);
const STANCE_PRON = new Set(['i', 'we']);

const MIN_SPRAY = 3;
const MIN_SPRAY_PER_100_WORDS = 0.8;

export const fillerIntensifiers = defineRule({
  meta: {
    name: 'filler-intensifiers',
    category: 'performance',
    docs: { description: 'Sincerity adverbs (genuinely, truly, really) doing the believing for the reader.' },
  },
  create(ctx) {
    const spray: Array<{ s: DepSentence; t: DepToken }> = [];
    let wordCount = 0;
    return {
      Sentence(sentence) {
        wordCount += sentence.words.length;
        const s: DepSentence = sentence.dep;
        for (const t of s.tokens) {
          if (t.deprel !== 'advmod' || !INTENSIFIER.has(lower(t))) continue;
          const head = s.tokens.find((x) => x.id === t.head);
          const subj = head && head.upos === 'ADJ' && hasChild(s, head.id, 'cop')
            ? child(s, head.id, 'nsubj')
            : undefined;
          if (head && subj && STANCE_PRON.has(lower(subj))) {
            ctx.report({
              tokens: [t, head, ...subtree(s, head.id).filter((c) => c.deprel === 'cop' || c.deprel === 'nsubj')],
              sentence: s,
              message:
                `“${lower(t)} ${lower(head)}” — the intensifier performs sincerity the adjective already carries. `
                + `“${lower(head)}” does the work; “${lower(t)}” begs to be believed.`,
            });
          } else {
            spray.push({ s, t });
          }
        }
      },
      DocumentExit() {
        if (spray.length < MIN_SPRAY) return;
        if ((100 * spray.length) / Math.max(1, wordCount) < MIN_SPRAY_PER_100_WORDS) return;
        for (const { s, t } of spray) ctx.report({
          tokens: [t],
          sentence: s,
          confidence: 'low',
          message:
            `Intensifier spray: ${spray.length} filler intensifiers (genuinely / really / truly / actually) in this document. `
            + 'Each one weakens the word it decorates — cut them and let the claims stand.',
        });
      },
    };
  },
});
