import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  STANDARD_REFERENCES,
  assignSplits,
  loadCandidates,
  selectEvaluableCandidates,
  validateCandidates,
  type AssignedCandidate,
  type TechnicalEnglishCandidate,
} from '../eval/dataset.js';

const candidates = loadCandidates();

function copyCandidate(
  candidate: TechnicalEnglishCandidate,
  changes: Partial<TechnicalEnglishCandidate> = {},
): TechnicalEnglishCandidate {
  return structuredClone({ ...candidate, ...changes });
}

test('candidate dataset has balanced coverage and explicit unreviewed provenance', () => {
  assert.equal(candidates.length, 48);
  assert.equal(candidates.filter(({ label }) => label === 'finding').length, 24);
  assert.equal(candidates.filter(({ label }) => label === 'clear').length, 24);
  assert.equal(candidates.filter(({ evaluation }) => evaluation.pool === 'rotation').length, 36);
  assert.equal(candidates.filter(({ evaluation }) => evaluation.pool === 'reserved-public').length, 12);
  assert.ok(candidates.every(({ review }) => review.status === 'ai-candidate'));
  assert.ok(candidates.every(({ provenance }) => provenance.copiedFromStandard === false));
  for (const reference of STANDARD_REFERENCES) {
    assert.equal(candidates.filter(({ primaryReference }) => primaryReference === reference).length, 8);
  }
});

test('candidate dataset passes structural, metadata, and boundary validation', () => {
  assert.deepEqual(validateCandidates(candidates), []);
});

test('default split is balanced by reference and keeps the reserved public pool fixed', () => {
  const assigned = assignSplits(candidates, 'ste-eval-v1');
  assert.equal(assigned.filter(({ split }) => split === 'development').length, 24);
  assert.equal(assigned.filter(({ split }) => split === 'evaluation').length, 12);
  assert.equal(assigned.filter(({ split }) => split === 'reserved-public').length, 12);
  for (const reference of STANDARD_REFERENCES) {
    assert.equal(assigned.filter((candidate) => candidate.primaryReference === reference && candidate.split === 'development').length, 4);
    assert.equal(assigned.filter((candidate) => candidate.primaryReference === reference && candidate.split === 'evaluation').length, 2);
    assert.equal(assigned.filter((candidate) => candidate.primaryReference === reference && candidate.split === 'reserved-public').length, 2);
  }
});

test('semantic families and template groups never cross assigned splits', () => {
  const assigned = assignSplits(candidates, 'ste-eval-v1');
  for (const key of ['semanticFamilyId', 'templateGroupId'] as const) {
    const splits = new Map<string, Set<string>>();
    for (const candidate of assigned) {
      const seen = splits.get(candidate[key]) ?? new Set<string>();
      seen.add(candidate.split);
      splits.set(candidate[key], seen);
    }
    assert.ok([...splits.values()].every((seen) => seen.size === 1));
  }
});

test('a new seed rotates development and evaluation without moving reserved public families', () => {
  const first = assignSplits(candidates, 'ste-eval-v1');
  const second = assignSplits(candidates, 'ste-eval-v2');
  const rotatingFirst = new Map(first
    .filter(({ evaluation }) => evaluation.pool === 'rotation')
    .map(({ semanticFamilyId, split }) => [semanticFamilyId, split]));
  const rotatingSecond = new Map(second
    .filter(({ evaluation }) => evaluation.pool === 'rotation')
    .map(({ semanticFamilyId, split }) => [semanticFamilyId, split]));
  assert.ok([...rotatingFirst].some(([family, split]) => rotatingSecond.get(family) !== split));
  assert.ok(second
    .filter(({ evaluation }) => evaluation.pool === 'reserved-public')
    .every(({ split }) => split === 'reserved-public'));
});

test('expected findings use exact UTF-16 ranges and distinguish repeated punctuation', () => {
  const repeated = candidates.find(({ id }) => id === 'ste-81-three-actions-semicolons')!;
  assert.deepEqual(repeated.expectedFindings[0]!.matches, [
    { text: ';', start: 16, end: 17 },
    { text: ';', start: 34, end: 35 },
  ]);
  for (const candidate of candidates) {
    for (const finding of candidate.expectedFindings) {
      for (const match of finding.matches) {
        assert.equal(candidate.text.slice(match.start, match.end), match.text);
      }
    }
  }

  const utf16 = copyCandidate(candidates.find(({ id }) => id === 'ste-81-drain-semicolon')!, {
    id: 'utf16-range-example',
    text: '🔧; Open the valve.',
    semanticFamilyId: 'utf16-range-family',
    templateGroupId: 'utf16-range-template',
  });
  utf16.expectedFindings[0]!.matches = [{ text: ';', start: 1, end: 2 }];
  assert.ok(validateCandidates([utf16]).some(({ message }) => message.includes('does not equal the source text')));
  utf16.expectedFindings[0]!.matches = [{ text: ';', start: 2, end: 3 }];
  assert.deepEqual(validateCandidates([utf16]), []);
});

test('candidate selection always excludes rejected rows', () => {
  const base = assignSplits(candidates, 'ste-eval-v1')[0]!;
  const approved = structuredClone(base);
  approved.id = 'approved-row';
  approved.review = { status: 'human-approved', reviewer: 'reviewer', reviewedAt: '2026-08-10', notes: null };
  const unreviewed = structuredClone(base);
  unreviewed.id = 'unreviewed-row';
  const rejected = structuredClone(base);
  rejected.id = 'rejected-row';
  rejected.review = { status: 'rejected', reviewer: 'reviewer', reviewedAt: '2026-08-10', notes: 'Ambiguous.' };
  const rows: AssignedCandidate[] = [approved, unreviewed, rejected];

  assert.deepEqual(selectEvaluableCandidates(rows, false).map(({ id }) => id), ['approved-row']);
  assert.deepEqual(selectEvaluableCandidates(rows, true).map(({ id }) => id), ['approved-row', 'unreviewed-row']);
  assert.throws(
    () => selectEvaluableCandidates(rows, true, 'final-holdout'),
    /final holdout requires human-approved candidates/,
  );
  assert.deepEqual(selectEvaluableCandidates(rows, false, 'final-holdout').map(({ id }) => id), ['approved-row']);
});

test('validation rejects duplicate normalized text and semantic-family leakage', () => {
  const original = candidates[0]!;
  const duplicate = copyCandidate(candidates[1]!, {
    id: 'synthetic-duplicate',
    text: `  ${original.text.toLocaleUpperCase('en-US')}  `,
  });
  const leaked = copyCandidate(candidates[1]!, {
    id: 'synthetic-leak',
    evaluation: { pool: 'reserved-public' },
  });
  const wrongReference = copyCandidate(candidates[1]!, {
    id: 'synthetic-reference-leak',
    primaryReference: '4.2',
  });
  const issues = validateCandidates([original, duplicate, leaked, wrongReference]);
  assert.ok(issues.some(({ id, message }) => id === duplicate.id && message.includes('duplicates')));
  assert.ok(issues.some(({ id, message }) => id === leaked.id && message.includes('cannot span evaluation pools')));
  assert.ok(issues.some(({ id, message }) => id === wrongReference.id && message.includes('cannot span standard references')));
});

test('validation rejects missing provenance and incomplete human review metadata', () => {
  const missingAuthor = copyCandidate(candidates[0]!);
  missingAuthor.id = 'missing-author';
  missingAuthor.provenance.authorId = '';
  const incompleteReview = copyCandidate(candidates[2]!);
  incompleteReview.id = 'incomplete-review';
  incompleteReview.review.status = 'human-approved';
  const issues = validateCandidates([missingAuthor, incompleteReview]);
  assert.ok(issues.some(({ id, message }) => id === missingAuthor.id && message.includes('provenance')));
  assert.ok(issues.some(({ id, message }) => id === incompleteReview.id && message.includes('requires a reviewer')));
});

test('validation rejects invalid references, modes, labels, and rule IDs', () => {
  const invalid = copyCandidate(candidates[0]!);
  invalid.id = 'invalid-enums';
  invalid.mode = 'instructions' as never;
  invalid.label = 'maybe' as never;
  invalid.expectedFindings[0]!.ruleId = 'technical-english/not-a-rule';
  const invalidReference = copyCandidate(candidates[0]!);
  invalidReference.id = 'invalid-reference';
  invalidReference.primaryReference = '10.2' as never;
  const issues = validateCandidates([invalid, invalidReference]);
  assert.ok(issues.some(({ id, message }) => id === invalid.id && message.includes('invalid mode')));
  assert.ok(issues.some(({ id, message }) => id === invalid.id && message.includes('invalid label')));
  assert.ok(issues.some(({ id, message }) => id === invalid.id && message.includes('unexpected ruleId')));
  assert.ok(issues.some(({ id, message }) => id === invalidReference.id && message.includes('invalid primaryReference')));
});

test('validation rejects impossible boundary metadata and labels', () => {
  const wrongCount = copyCandidate(candidates.find(({ id }) => id === 'ste-51-disconnect-at-limit')!);
  wrongCount.id = 'wrong-word-count';
  wrongCount.boundary!.observed = 19;
  const wrongLabel = copyCandidate(candidates.find(({ id }) => id === 'ste-66-oil-seven')!);
  wrongLabel.id = 'wrong-boundary-label';
  wrongLabel.label = 'clear';
  wrongLabel.expectedFindings = [];
  const unsupported = copyCandidate(candidates[0]!);
  unsupported.id = 'unsupported-boundary';
  unsupported.boundary = { measure: 'word-count', observed: 8, limit: 8, relation: 'at-limit' };
  const issues = validateCandidates([wrongCount, wrongLabel, unsupported]);
  assert.ok(issues.some(({ id, message }) => id === wrongCount.id && message.includes('does not match measured')));
  assert.ok(issues.some(({ id, message }) => id === wrongLabel.id && message.includes('label does not agree')));
  assert.ok(issues.some(({ id, message }) => id === unsupported.id && message.includes('not supported')));
});

test('validation rejects invalid expected source ranges', () => {
  const invalid = copyCandidate(candidates.find(({ id }) => id === 'ste-81-drain-semicolon')!);
  invalid.id = 'invalid-source-range';
  invalid.expectedFindings[0]!.matches[0]!.start += 1;
  invalid.expectedFindings[0]!.matches[0]!.end += 1;
  assert.ok(validateCandidates([invalid]).some(({ message }) => message.includes('does not equal the source text')));
});

test('splitter rejects invalid data and empty seeds', () => {
  assert.throws(() => assignSplits(candidates, '   '), /non-empty split seed/);
  const duplicate = copyCandidate(candidates[0]!, { id: candidates[1]!.id });
  assert.throws(() => assignSplits([candidates[1]!, duplicate], 'seed'), /Dataset validation failed/);
});
