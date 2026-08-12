import { defineConfig, type Config } from 'writinglint-core';
import { ci, recommended, strict } from 'writinglint-rulepack-ai-style';
import {
  ci as readerFirstCi,
  recommended as readerFirstRecommended,
  strict as readerFirstStrict,
} from 'writinglint-rulepack-reader-first';
import type { InputKind } from './extract.js';

export type ProfileName = 'recommended' | 'strict' | 'ci';
export type RulepackName = 'ai-style' | 'reader-first';

export function profileFor(
  kind: InputKind,
  profile: ProfileName = 'recommended',
  rulepacks: readonly RulepackName[] = ['ai-style'],
): Config {
  const aiBase = profile === 'strict' ? strict : profile === 'ci' ? ci : recommended;
  const readerBase = profile === 'strict'
    ? readerFirstStrict
    : profile === 'ci' ? readerFirstCi : readerFirstRecommended;
  const selected: Config[] = [];
  if (rulepacks.includes('ai-style')) {
    selected.push(kind === 'prose' ? aiBase : defineConfig({
      extends: [aiBase],
      rules: {
        'ai-style/emoji': 'off',
        'ai-style/passive-actor-hiding': 'off',
        'ai-style/semantic-redundancy': 'off',
      },
    }));
  }
  if (rulepacks.includes('reader-first')) selected.push(readerBase);
  return defineConfig({
    extends: selected,
    minimumSeverity: profile === 'strict' ? 'info' : profile === 'ci' ? 'error' : 'warn',
  });
}
