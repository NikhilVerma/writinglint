import { defineConfig, type Config } from 'writinglint-core';
import { ci, recommended, strict } from 'writinglint-rulepack-ai-style';
import type { InputKind } from './extract.js';

export type ProfileName = 'recommended' | 'strict' | 'ci';

export function profileFor(kind: InputKind, profile: ProfileName = 'recommended'): Config {
  const base = profile === 'strict' ? strict : profile === 'ci' ? ci : recommended;
  if (kind === 'prose') return base;
  return defineConfig({
    extends: [base],
    rules: {
      'ai-style/emoji': 'off',
      'ai-style/passive-actor-hiding': 'off',
    },
  });
}
