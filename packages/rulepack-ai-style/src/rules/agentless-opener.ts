/**
 * Agentless opener — "Notes attached, and they are a fuller record than the
 * summary." The sentence opens in telegraphic register (bare noun + participle,
 * doer elided), then switches to essay register by circling back with a
 * pronoun. Each register is fine alone: "Notes attached." is a normal
 * telegraphic sentence, and "I've attached the notes — a fuller record" names
 * the doer. The splice of the two in one sentence is the chatbot-email tell.
 *
 * Graph shape: the sentence root is a bare participle (nsubj/nsubj:pass child,
 * NO aux or copula) or a noun with an immediately-following bare `acl`
 * participle, the whole opener is at most four tokens before a comma, and a
 * `conj`/`parataxis` clause follows whose subject is a back-referring pronoun.
 */
import { byId, childrenOf, defineRule, lower, root as rootOf, subtree, type DepSentence } from 'writinglint-core';

const BACK_REF = new Set(['it', 'they', 'this', 'that']);
const MAX_OPENER_TOKENS = 4;

export const agentlessOpener = defineRule({
  meta: {
    name: 'agentless-opener',
    category: 'agency',
    docs: { description: 'Telegraphic verbless opener spliced with an “and it …” clause — the doer never appears.' },
  },
  create(ctx) {
    return {
      Sentence(sentence) {
        const s: DepSentence = sentence.dep;
        const root = rootOf(s);
        if (!root) return;
        const kids = childrenOf(s, root.id);
        const shapeA = root.upos === 'VERB' && root.id <= 3
          && kids.some((c) => c.deprel === 'nsubj:pass' || c.deprel === 'nsubj')
          && !kids.some((c) => c.deprel === 'aux' || c.deprel === 'aux:pass' || c.deprel === 'cop');
        const shapeB = root.upos === 'NOUN' && root.id <= 2
          && kids.some((c) => c.deprel === 'acl' && c.upos === 'VERB' && c.id === root.id + 1);
        if (!shapeA && !shapeB) return;
        const cont = kids.find((c) => c.deprel === 'conj' || c.deprel === 'parataxis');
        if (!cont) return;
        const subj = childrenOf(s, cont.id).find((c) => c.deprel === 'nsubj' || c.deprel.startsWith('nsubj:'));
        if (!subj || subj.upos !== 'PRON' || !BACK_REF.has(lower(subj))) return;
        // The telegraphic opener must actually be telegraphic: everything
        // before the continuation clause fits in a few tokens, and a comma
        // sits on the boundary (the parser may attach it to either clause).
        const contStart = subtree(s, cont.id).reduce((min, c) => Math.min(min, c.id), cont.id);
        const opener = s.tokens.filter((t) => t.id < contStart && t.upos !== 'PUNCT');
        if (opener.length > MAX_OPENER_TOKENS) return;
        const boundary = byId(s, contStart);
        const last = byId(s, contStart - 1);
        if (boundary?.form !== ',' && last?.form !== ',') return;
        ctx.report({
          tokens: opener,
          sentence: s,
          message:
            'Agentless opener: a verbless fragment (“Notes attached, and it …”) that circles back with a pronoun. '
            + 'Name the doer — “I’ve attached the notes — a fuller record than the summary.”',
        });
      },
    };
  },
});
