import { childrenOf, defineRule } from 'writinglint-core';

const TRANSITION_LEADS = new Set(['after', 'and', 'before', 'but', 'for', 'no', 'not', 'now', 'then', 'until', 'yet']);
const STRONG_LEADS = new Set(['no', 'not', 'then', 'until']);

export const dramaticFragment = defineRule({
  meta: {
    name: 'dramatic-fragment',
    category: 'meta',
    docs: { description: 'A short transition is isolated as a sentence to manufacture drama.' },
  },
  create(ctx) {
    const candidates: Array<{ text: string; start: number; end: number; strong: boolean }> = [];
    return {
      Sentence(sentence) {
        const words = sentence.words;
        if (words.length < 1 || words.length > 4) return;
        if (!sentence.text.trim().endsWith('.')) return;
        const root = sentence.dep.tokens.find((token) => token.deprel === 'root');
        if (!root || root.upos === 'VERB' || root.upos === 'AUX') return;
        const lead = words[0]!.lower;
        if (!TRANSITION_LEADS.has(lead)) return;
        const rootChildren = childrenOf(sentence.dep, root.id);
        if (!rootChildren.some((token) =>
          token.deprel === 'case' || token.deprel === 'advmod' || token.deprel === 'cc' || token.deprel === 'mark'
        )) return;
        candidates.push({
          text: sentence.text.trim(),
          start: sentence.start,
          end: sentence.end,
          strong: STRONG_LEADS.has(lead),
        });
      },
      DocumentExit() {
        for (const candidate of candidates) {
          ctx.report({
            span: { start: candidate.start, end: candidate.end },
            confidence: candidates.length >= 2 || candidate.strong ? 'medium' : 'low',
            message: `Dramatic fragment (“${candidate.text}”) isolates a transition for emphasis. Join it to the claim that follows.`,
          });
        }
      },
    };
  },
});
