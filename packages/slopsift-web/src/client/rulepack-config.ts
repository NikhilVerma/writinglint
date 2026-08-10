import { resolveConfig } from 'writinglint-core';
import { strict } from 'writinglint-rulepack-ai-style';
import { descriptive, procedural } from 'writinglint-rulepack-technical-english';
import type { RulepackPreset } from './rulepack-selection.js';

const configs = {
  'ai-style': resolveConfig(strict),
  'asd-ste100-descriptive': resolveConfig(descriptive),
  'asd-ste100-procedural': resolveConfig(procedural),
} satisfies Record<RulepackPreset, ReturnType<typeof resolveConfig>>;

export function configForRulepackPreset(preset: RulepackPreset): ReturnType<typeof resolveConfig> {
  return configs[preset];
}
