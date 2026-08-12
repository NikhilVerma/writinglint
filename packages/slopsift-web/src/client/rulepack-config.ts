import { defineConfig, resolveConfig } from 'writinglint-core';
import { strict as aiStyle } from 'writinglint-rulepack-ai-style';
import { strict as readerFirst } from 'writinglint-rulepack-reader-first';
import type { RulepackPreset } from './rulepack-selection.js';

const configs = {
  'ai-style': resolveConfig(aiStyle),
  'reader-first': resolveConfig(readerFirst),
  combined: resolveConfig(defineConfig({ extends: [aiStyle, readerFirst], minimumSeverity: 'info' })),
} satisfies Record<RulepackPreset, ReturnType<typeof resolveConfig>>;

export function configForRulepackPreset(preset: RulepackPreset): ReturnType<typeof resolveConfig> {
  return configs[preset];
}
