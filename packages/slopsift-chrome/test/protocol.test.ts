import assert from 'node:assert/strict';
import test from 'node:test';
import { atLeastSeverity, diagnosticSegments, type LintDiagnostic } from '../src/protocol.js';

function lint(start: number, end: number, severity: LintDiagnostic['severity']): LintDiagnostic {
  return {
    ruleId: 'ai-style/test',
    category: 'test',
    confidence: 'medium',
    severity,
    start,
    end,
    text: '',
    message: 'test',
  };
}

test('minimum severity follows ESLint-style levels', () => {
  assert.equal(atLeastSeverity(lint(0, 1, 'info'), 'warn'), false);
  assert.equal(atLeastSeverity(lint(0, 1, 'warn'), 'warn'), true);
  assert.equal(atLeastSeverity(lint(0, 1, 'error'), 'warn'), true);
});

test('diagnostic segments prefer the strongest overlapping finding', () => {
  assert.deepEqual(diagnosticSegments('abcdef', [lint(1, 5, 'info'), lint(3, 6, 'error')]), [
    { start: 0, end: 1 },
    { start: 1, end: 3, severity: 'info' },
    { start: 3, end: 6, severity: 'error' },
  ]);
});
