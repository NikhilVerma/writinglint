import { defineConfig, type Config } from 'writinglint-core';
import { ci, recommended, strict } from 'writinglint-rulepack-ai-style';
import { descriptive, procedural } from 'writinglint-rulepack-technical-english';
import type { InputKind } from './extract.js';

export type ProfileName = 'recommended' | 'strict' | 'ci';
export type RulepackName = 'ai-style' | 'asd-ste100';
export type TechnicalEnglishMode = 'descriptive' | 'procedural';

export function profileFor(
  kind: InputKind,
  profile: ProfileName = 'recommended',
  rulepacks: readonly RulepackName[] = ['ai-style'],
  technicalMode: TechnicalEnglishMode = 'descriptive',
): Config {
  const base = profile === 'strict' ? strict : profile === 'ci' ? ci : recommended;
  const selected: Config[] = [];
  if (rulepacks.includes('ai-style')) {
    selected.push(kind === 'prose' ? base : defineConfig({
      extends: [base],
      rules: {
        'ai-style/emoji': 'off',
        'ai-style/passive-actor-hiding': 'off',
        'ai-style/semantic-redundancy': 'off',
      },
    }));
  }
  if (rulepacks.includes('asd-ste100')) {
    selected.push(technicalMode === 'procedural' ? procedural : descriptive);
  }
  return defineConfig({
    extends: selected,
    minimumSeverity: profile === 'strict' ? 'info' : profile === 'ci' ? 'error' : 'warn',
  });
}
