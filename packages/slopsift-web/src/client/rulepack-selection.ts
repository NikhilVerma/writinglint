import type { AsdSte100Issue9Assessment } from 'writinglint-rulepack-technical-english';

export const RULEPACK_PRESETS = [
  { value: 'ai-style', label: 'AI style' },
  { value: 'asd-ste100-descriptive', label: 'ASD-STE100 descriptive' },
  { value: 'asd-ste100-procedural', label: 'ASD-STE100 procedural' },
] as const;

export type RulepackPreset = typeof RULEPACK_PRESETS[number]['value'];

export function normalizeRulepackPreset(value: unknown): RulepackPreset {
  return RULEPACK_PRESETS.some((preset) => preset.value === value)
    ? value as RulepackPreset
    : 'ai-style';
}

export function isTechnicalEnglishPreset(preset: RulepackPreset): boolean {
  return preset !== 'ai-style';
}

export function statusForResult(
  lints: readonly { severity: 'error' | 'warn' | 'info' }[],
  assessment?: AsdSte100Issue9Assessment,
): string {
  if (!assessment) return `${lints.length} finding${lints.length === 1 ? '' : 's'} found`;
  if (assessment.status === 'nonconformant') {
    return `ASD-STE100 nonconformant: ${assessment.automatedRuleFindings} automated finding${assessment.automatedRuleFindings === 1 ? '' : 's'}`;
  }
  return assessment.automatedRuleFindings
    ? `ASD-STE100 review required: ${assessment.automatedRuleFindings} automated finding${assessment.automatedRuleFindings === 1 ? '' : 's'}`
    : assessment.standardData.loaded
      ? 'No automated ASD-STE100 violations. Local dictionary checks ran; human review is still required.'
      : 'No automated ASD-STE100 violations. Dictionary and human review are still required.';
}

export function emptyResultFor(
  preset: RulepackPreset,
  assessment?: AsdSte100Issue9Assessment,
): { title: string; detail: string } {
  if (isTechnicalEnglishPreset(preset)) {
    return {
      title: 'No automated violations found.',
      detail: assessment?.standardData.loaded
        ? 'Local dictionary checks ran. Meaning and human review are still required.'
        : assessment
          ? 'The controlled dictionary and human review are still required.'
        : 'Run the technical-English checks to assess this draft.',
    };
  }
  return { title: 'No tells found.', detail: 'This draft reads clean to the active rules.' };
}

export function ruleUrl(ruleId: string): string {
  return ruleId.startsWith('technical-english/')
    ? 'https://www.asd-ste100.org/'
    : `https://slopsift.dev/rules/${encodeURIComponent(ruleId.split('/')[1] ?? ruleId)}/`;
}
