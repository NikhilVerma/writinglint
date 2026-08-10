import { childrenOf, defineRule, regionsOverlapping } from 'writinglint-core';

export interface PassiveVoiceOptions {
  mode?: 'descriptive' | 'procedural';
}

export const passiveVoice = defineRule<PassiveVoiceOptions>({
  meta: {
    name: 'passive-voice',
    category: 'technical-sentences',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['part-of-speech', 'dependencies'] },
    docs: {
      description: 'Use active voice, with a limited descriptive-text exception (ASD-STE100 Issue 9, rule 3.6).',
    },
  },
  create(context) {
    return {
      Sentence(sentence) {
        const regionMode = regionsOverlapping(context.doc.regions, sentence.start, sentence.end)
          .filter(({ mode }) => mode === 'descriptive' || mode === 'procedural')
          .sort((left, right) => (left.end - left.start) - (right.end - right.start))[0]?.mode;
        const mode = regionMode === 'descriptive' || regionMode === 'procedural'
          ? regionMode
          : context.options.mode ?? 'descriptive';
        const passiveVerbs = sentence.dep.tokens.filter((token) =>
          token.upos === 'VERB'
          && childrenOf(sentence.dep, token.id).some((child) => child.deprel === 'aux:pass'));
        if (!passiveVerbs.length) return;
        const first = passiveVerbs[0]!;
        const last = passiveVerbs.at(-1)!;
        context.report({
          span: { start: first.start, end: last.end },
          message: mode === 'procedural'
            ? 'Use active voice in procedural text. Name the person or component that does the action.'
            : 'This sentence uses passive voice. Use active voice unless the actor is unknown or unimportant in this descriptive text.',
          evidence: [{ kind: 'document-mode', data: { mode, source: regionMode ? 'region' : 'rule-option' } }],
        });
      },
    };
  },
});
