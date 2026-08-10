import { resolveConfig } from 'writinglint-core';
import { strict } from 'writinglint-rulepack-ai-style';
import {
  descriptive,
  procedural,
  withAsdSte100StandardData,
  type AsdSte100Issue9StandardData,
} from 'writinglint-rulepack-technical-english';
import type { RulepackPreset } from './rulepack-selection.js';

const configs = {
  'ai-style': resolveConfig(strict),
  'asd-ste100-descriptive': resolveConfig(descriptive),
  'asd-ste100-procedural': resolveConfig(procedural),
} satisfies Record<RulepackPreset, ReturnType<typeof resolveConfig>>;

export function configForRulepackPreset(
  preset: RulepackPreset,
  standardData?: AsdSte100Issue9StandardData,
): ReturnType<typeof resolveConfig> {
  if (standardData && preset !== 'ai-style') {
    return resolveConfig(withAsdSte100StandardData(
      preset === 'asd-ste100-procedural' ? 'procedural' : 'descriptive',
      standardData,
    ));
  }
  return configs[preset];
}
