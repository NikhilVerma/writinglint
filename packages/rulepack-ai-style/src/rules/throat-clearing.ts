/**
 * Chatbot throat-clearing — expletive-"it" + copula + [importance adj] + to +
 * [cognition verb]: "It is important to note that …". Structure from the parse;
 * the two adjective/verb slots are small semantic seeds (POS can't open them).
 */
import { childrenOf, defineRule, hasChild, lower, subtree, type DepSentence } from 'writinglint-core';

const IMPORTANCE_ADJ = new Set([
  'important', 'critical', 'crucial', 'essential', 'vital', 'key', 'necessary',
  'noteworthy', 'worth', 'worthwhile', 'useful', 'helpful', 'significant', 'imperative', 'interesting',
]);
const COGNITION_VERB = new Set([
  'note', 'mention', 'remember', 'understand', 'consider', 'recognize', 'recognise',
  'realize', 'realise', 'appreciate', 'emphasize', 'emphasise', 'highlight', 'acknowledge',
  'stress', 'underscore', 'clarify', 'point',
]);


/** The expletive subject this rule is named for. The parser labels it `expl`
 * when a copula heads the clause and `nsubj:outer` when the cognition verb
 * does; referential "it" arrives as a plain `nsubj`. All three spell the same
 * throat-clearing frame. */
const isExpletiveIt = (token: { deprel: string; form: string }): boolean =>
  (token.deprel === 'expl' || token.deprel.startsWith('nsubj')) && token.form.toLowerCase() === 'it';

/** COGNITION_VERB lists bare forms, but "worth noting" arrives as a gerund and
 * the parser's `lemma` is only the lowercased surface form, so it cannot help
 * here. Undoing the "-ing" covers every verb in the set: "noting" needs the
 * dropped "e" back, the rest are bare stems already. */
const isCognitionVerb = (token: { form: string }): boolean => {
  const form = token.form.toLowerCase();
  if (COGNITION_VERB.has(form)) return true;
  if (!form.endsWith('ing')) return false;
  const stem = form.slice(0, -3);
  return COGNITION_VERB.has(stem) || COGNITION_VERB.has(`${stem}e`);
};

export const throatClearing = defineRule({
  meta: {
    name: 'throat-clearing',
    category: 'meta',
    docs: { description: '“it is important to note that …”. If it matters, just say it.' },
  },
  create(ctx) {
    return {
      Sentence(sentence) {
        const s: DepSentence = sentence.dep;
        // "It is worth noting that …" parses nothing like "It is important to
        // note that …": the cognition verb heads the clause and the importance
        // word hangs off it. The parser is not steady about how — the same
        // frame yields `worth`/`advmod` + `is`/`aux` on one complement and
        // `worth`/`mark` + `is`/`cop` on another — so this branch pins the
        // parts that hold and stays loose about the labels joining them.
        for (const verb of s.tokens) {
          if (verb.upos !== 'VERB' || !isCognitionVerb(verb)) continue;
          const children = childrenOf(s, verb.id);
          if (!children.some((c) => c.upos === 'ADJ' && (c.deprel === 'advmod' || c.deprel === 'mark') && IMPORTANCE_ADJ.has(lower(c)))) continue;
          if (!children.some((c) => c.deprel === 'aux' || c.deprel === 'cop')) continue;
          const subj = children.find((c) => isExpletiveIt(c));
          if (!subj) continue;
          ctx.report({
            tokens: [subj, ...subtree(s, verb.id)],
            sentence: s,
            message: 'Throat-clearing (\u201cit is important to note that \u2026\u201d). If it matters, just say it.',
          });
        }
        for (const adj of s.tokens) {
          if (adj.upos !== 'ADJ' || !IMPORTANCE_ADJ.has(lower(adj))) continue;
          if (!hasChild(s, adj.id, 'cop')) continue;
          // The parser labels this "it" `expl`, not `nsubj` — it is the
          // expletive the rule is named for, and it carries no referent. Asking
          // only for `nsubj` matched nothing, so the rule never fired on the
          // canonical "It is important to note that …". Referential "it" still
          // arrives as `nsubj`, so both relations are accepted.
          const subj = childrenOf(s, adj.id).find((c) => isExpletiveIt(c));
          if (!subj) continue;
          const verb = childrenOf(s, adj.id).find(
            (c) =>
              (c.deprel === 'xcomp' || c.deprel === 'csubj' || c.deprel === 'advcl' || c.deprel === 'acl') &&
              c.upos === 'VERB' &&
              isCognitionVerb(c),
          );
          if (!verb) continue;
          ctx.report({
            tokens: [subj, ...subtree(s, adj.id)],
            sentence: s,
            message: 'Throat-clearing (“it is important to note that …”). If it matters, just say it.',
          });
        }
      },
    };
  },
});
