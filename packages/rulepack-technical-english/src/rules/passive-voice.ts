import { childrenOf, defineRule } from 'writinglint-core';

export interface PassiveVoiceOptions {
  mode?: 'descriptive' | 'procedural';
}

export const passiveVoice = defineRule<PassiveVoiceOptions>({
  meta: {
    name: 'passive-voice',
    category: 'technical-sentences',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    docs: {
      description: 'Use active voice, with a limited descriptive-text exception (ASD-STE100 Issue 9, rule 3.6).',
    },
  },
  create(context) {
    const mode = context.options.mode ?? 'descriptive';
    return {
      Sentence(sentence) {
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
        });
      },
    };
  },
});
