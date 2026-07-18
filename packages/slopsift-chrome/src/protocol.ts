import type { ActiveSeverity, Lint } from 'writinglint-core';

export interface ExtensionSettings {
  enabled: boolean;
  minimumSeverity: ActiveSeverity;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  minimumSeverity: 'warn',
};

export type LintDiagnostic = Pick<
  Lint,
  'ruleId' | 'category' | 'severity' | 'confidence' | 'start' | 'end' | 'text' | 'message' | 'suggestion'
>;

export type RuntimeRequest =
  | { type: 'lint'; text: string }
  | { type: 'status' };

export type RuntimeResponse =
  | { ok: true; lints: LintDiagnostic[] }
  | { ok: true; ready: boolean }
  | { ok: false; error: string };

const SEVERITY_RANK: Record<ActiveSeverity, number> = { info: 0, warn: 1, error: 2 };

export function atLeastSeverity(lint: Pick<LintDiagnostic, 'severity'>, minimum: ActiveSeverity): boolean {
  return SEVERITY_RANK[lint.severity] >= SEVERITY_RANK[minimum];
}

export interface DiagnosticSegment {
  start: number;
  end: number;
  severity?: ActiveSeverity;
}

/** Flatten overlapping diagnostics into stable ranges for a text mirror. */
export function diagnosticSegments(text: string, lints: readonly LintDiagnostic[]): DiagnosticSegment[] {
  if (!text) return [];
  const owner = new Array<ActiveSeverity | undefined>(text.length);
  for (const lint of lints) {
    const start = Math.max(0, Math.min(text.length, lint.start));
    const end = Math.max(start, Math.min(text.length, lint.end));
    for (let index = start; index < end; index++) {
      const current = owner[index];
      if (!current || SEVERITY_RANK[lint.severity] > SEVERITY_RANK[current]) owner[index] = lint.severity;
    }
  }
  const segments: DiagnosticSegment[] = [];
  let start = 0;
  while (start < text.length) {
    const severity = owner[start];
    let end = start + 1;
    while (end < text.length && owner[end] === severity) end++;
    segments.push({ start, end, ...(severity ? { severity } : {}) });
    start = end;
  }
  return segments;
}
