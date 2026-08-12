export const RULEPACK_PRESETS = [
  { value: 'combined', label: 'AI style + reader-first' },
  { value: 'ai-style', label: 'AI style' },
  { value: 'reader-first', label: 'Reader-first' },
] as const;

export type RulepackPreset = typeof RULEPACK_PRESETS[number]['value'];

export function normalizeRulepackPreset(value: unknown): RulepackPreset {
  return RULEPACK_PRESETS.some((preset) => preset.value === value)
    ? value as RulepackPreset
    : 'combined';
}

export function statusForResult(lints: readonly unknown[]): string {
  return `${lints.length} finding${lints.length === 1 ? '' : 's'} found`;
}

export function emptyResultFor(): { title: string; detail: string } {
  return { title: 'No problems found.', detail: 'This draft reads clean to the active rules.' };
}

export function ruleUrl(ruleId: string): string {
  return `https://slopsift.dev/rules/${encodeURIComponent(ruleId.split('/')[1] ?? ruleId)}/`;
}
