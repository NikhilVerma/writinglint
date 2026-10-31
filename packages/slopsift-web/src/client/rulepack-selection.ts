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

/**
 * Counts errors and warnings. Notes are low-confidence hints, and they mostly
 * land on complete sentences, so counting them made clear writing score worse.
 */
export function seriousFindingCount(lints: ReadonlyArray<{ severity: string }>): number {
  return lints.filter((lint) => lint.severity !== 'info').length;
}

export function statusForResult(lints: ReadonlyArray<{ severity: string }>): string {
  const serious = seriousFindingCount(lints);
  const notes = lints.length - serious;
  const summary = `${serious} finding${serious === 1 ? '' : 's'} found`;
  return notes ? `${summary} · ${notes} note${notes === 1 ? '' : 's'}` : summary;
}

export function emptyResultFor(): { title: string; detail: string } {
  return { title: 'No problems found.', detail: 'This draft reads clean to the active rules.' };
}

export function ruleUrl(ruleId: string): string {
  return `https://slopsift.dev/rules/${encodeURIComponent(ruleId.split('/')[1] ?? ruleId)}/`;
}
