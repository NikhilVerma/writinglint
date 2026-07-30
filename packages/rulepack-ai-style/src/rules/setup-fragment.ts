/**
 * Setup fragment — a sentence that announces a point is coming instead of
 * making it: "One thing I wanted to put on the table before I talk to the
 * reviewers." Grammatically it is a noun-rooted fragment (no finite main
 * clause): "thing/note/caveat" carries a relative clause and the payoff is
 * deferred to the next sentence. The setup/payoff staging is a chatbot-email
 * signature; a human either states the point or attaches it ("One caveat:
 * we're two weeks behind.").
 */
import { childrenOf, defineRule, lower, root as rootOf, type DepSentence } from 'writinglint-core';

const SETUP_NOUN = new Set(['thing', 'note', 'caveat', 'ask', 'flag', 'point', 'question', 'request', 'disclaimer']);
const MIN_WORDS = 5;

export const setupFragment = defineRule({
  meta: {
    name: 'setup-fragment',
    category: 'performance',
    docs: { description: 'A noun-rooted fragment (“One thing I wanted to …”) that stages a point instead of making it.' },
  },
  create(ctx) {
    return {
      Sentence(sentence) {
        if (!sentence.text.trim().endsWith('.')) return;
        if (sentence.words.length < MIN_WORDS) return;
        const s: DepSentence = sentence.dep;
        const root = rootOf(s);
        if (!root || root.upos !== 'NOUN' || !SETUP_NOUN.has(lower(root))) return;
        const kids = childrenOf(s, root.id);
        if (!kids.some((c) => c.deprel === 'acl:relcl' || c.deprel === 'acl')) return;
        // A copula or a following clause means the sentence does state
        // something ("One thing is clear: …", "One caveat: we're late.").
        if (kids.some((c) => c.deprel === 'cop' || c.deprel === 'parataxis' || c.deprel === 'conj')) return;
        ctx.report({
          span: { start: sentence.start, end: sentence.end },
          message:
            'Setup fragment: this sentence announces that a point is coming instead of making it. '
            + 'Lead with the point itself, or attach it (“One caveat: …”).',
        });
      },
    };
  },
});
