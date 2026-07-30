/**
 * Performed candor — narrating one's own honesty instead of just being honest:
 * "to be fully transparent", "I'll be honest", "I would rather say that
 * plainly than have you guess", "put my cards on the table". Sincerity is a
 * property of the content; announcing it is a rhetorical move — and a
 * signature of chatbot-drafted email, where the model performs the *stance* of
 * candor it cannot actually hold. Zero hits across the human eval corpus, so
 * each match reports on its own.
 */
import { defineRule } from 'writinglint-core';

const CANDOR_RE =
  /\b(?:to be (?:fully |completely |totally |perfectly )?(?:transparent|candid|blunt|upfront|honest with you)|i (?:want|wanted) to be (?:transparent|honest|candid|direct|upfront)|i(?:'|’)ll be honest|let me be (?:clear|direct|blunt|honest|candid)|full disclosure|in the spirit of (?:transparency|candor|candour|honesty)|put (?:that|this|it|my cards) on the table|i(?: would|(?:'|’)d) rather (?:say|state|name) (?:that|this|it) (?:plainly|directly|outright)|(?:rather )?than have you guess|i want to (?:name|be explicit about)|not going to sugarcoat)\b/gi;

export const performedCandor = defineRule({
  meta: {
    name: 'performed-candor',
    category: 'performance',
    docs: { description: 'Announcing your own honesty (“to be transparent”, “I’ll be honest”) instead of enacting it.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        for (const m of doc.text.matchAll(CANDOR_RE))
          ctx.report({
            span: { start: m.index, end: m.index + m[0].length },
            message:
              `Performed candor (“${m[0]}”): this narrates your own honesty instead of enacting it. `
              + 'Cut the announcement and keep the content — the plain statement carries the sincerity.',
          });
      },
    };
  },
});
