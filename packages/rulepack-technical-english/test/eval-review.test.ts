import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCandidates, type TechnicalEnglishCandidate } from '../eval/dataset.js';
import {
  applyCandidateReviews,
  collectReviewFamilies,
  formatReviewFamily,
  parseReviewOptions,
  saveCandidatesAtomically,
} from '../eval/review.js';

const candidates = loadCandidates();

test('review families preserve split and semantic-family boundaries', () => {
  const families = collectReviewFamilies(candidates, 'ste-eval-v1', 'development');
  assert.equal(families.length, 12);
  assert.ok(families.every(({ split }) => split === 'development'));
  assert.ok(families.every(({ candidates: rows, pendingCount }) =>
    pendingCount === rows.length
      && rows.every(({ semanticFamilyId }) => semanticFamilyId === rows[0]!.semanticFamilyId)));
});

test('review display shows proposed evidence without running the detector', () => {
  const family = collectReviewFamilies(candidates, 'ste-eval-v1', 'development')
    .find(({ reference }) => reference === '8.1')!;
  const display = formatReviewFamily(family);
  assert.match(display, /Proposed label:/u);
  assert.match(display, /Proposed rule: technical-english\/no-semicolon/u);
  assert.match(display, /\[\d+, \d+\) ";"/u);
  assert.doesNotMatch(display, /actual detector output/iu);
});

test('candidate decisions can approve one family member and reject another', () => {
  const target = candidates[0]!.semanticFamilyId;
  const updated = applyCandidateReviews(candidates, target, [
    {
      candidateId: candidates[0]!.id,
      decision: 'approve',
      reviewer: 'Technical editor',
      reviewedAt: '2026-08-10',
      notes: 'Checked the voice construction.',
    },
    {
      candidateId: candidates[1]!.id,
      decision: 'reject',
      reviewer: 'Technical editor',
      reviewedAt: '2026-08-10',
      notes: 'The comparison changes an unrelated detail.',
    },
  ]);
  const family = updated.filter(({ semanticFamilyId }) => semanticFamilyId === target);
  assert.equal(family[0]!.review.status, 'human-approved');
  assert.equal(family[1]!.review.status, 'rejected');
  assert.ok(family.every(({ review }) => review.reviewer === 'Technical editor'));
  assert.equal(updated.find(({ semanticFamilyId }) => semanticFamilyId !== target)!.review.status, 'ai-candidate');
  assert.equal(candidates[0]!.review.status, 'ai-candidate');
});

test('a new candidate decision preserves a prior family decision', () => {
  const target = candidates[0]!.semanticFamilyId;
  const partlyReviewed = structuredClone(candidates);
  partlyReviewed[0]!.review = {
    status: 'human-approved',
    reviewer: 'First reviewer',
    reviewedAt: '2026-08-09',
    notes: 'Previously approved.',
  };
  const updated = applyCandidateReviews(partlyReviewed, target, [{
    candidateId: candidates[1]!.id,
    decision: 'reject',
    reviewer: 'Second reviewer',
    reviewedAt: '2026-08-10',
    notes: 'The negative example changes more than the target construction.',
  }]);
  assert.equal(updated[0]!.review.status, 'human-approved');
  assert.equal(updated[1]!.review.status, 'rejected');
  assert.equal(updated[1]!.review.reviewer, 'Second reviewer');
});

test('review decisions require a reviewer, date, notes, and a pending family', () => {
  const target = candidates[0]!.semanticFamilyId;
  const base = {
    candidateId: candidates[0]!.id,
    decision: 'approve' as const,
    reviewer: 'Reviewer',
    reviewedAt: '2026-08-10',
    notes: 'Reviewed.',
  };
  assert.throws(() => applyCandidateReviews(candidates, target, [{ ...base, reviewer: ' ' }]), /reviewer name/u);
  assert.throws(() => applyCandidateReviews(candidates, target, [{ ...base, reviewedAt: '10 August' }]), /YYYY-MM-DD/u);
  assert.throws(() => applyCandidateReviews(candidates, target, [{ ...base, notes: '' }]), /notes are required/u);
  assert.throws(() => applyCandidateReviews(candidates, 'missing-family', [base]), /Unknown semantic family/u);
  assert.throws(() => applyCandidateReviews(candidates, target, []), /At least one candidate review/u);
  assert.throws(() => applyCandidateReviews(candidates, target, [{ ...base, candidateId: candidates[2]!.id }]), /is not in semantic family/u);
  assert.throws(() => applyCandidateReviews(candidates, target, [base, base]), /more than one review decision/u);

  const reviewed = applyCandidateReviews(candidates, target, [base]);
  assert.throws(() => applyCandidateReviews(reviewed, target, [base]), /already human-approved/u);
});

test('atomic save writes valid JSONL and leaves no temporary file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ste-review-'));
  const path = join(directory, 'candidates.jsonl');
  try {
    writeFileSync(path, 'old contents\n');
    const target = candidates[0]!.semanticFamilyId;
    const family = candidates.filter(({ semanticFamilyId }) => semanticFamilyId === target);
    const updated = applyCandidateReviews(candidates, target, family.map((candidate) => ({
      candidateId: candidate.id,
      decision: 'approve' as const,
      reviewer: 'Reviewer',
      reviewedAt: '2026-08-10',
      notes: 'Checked against the authorized standard.',
    })));
    saveCandidatesAtomically(path, updated);
    const written = readFileSync(path, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as TechnicalEnglishCandidate);
    assert.equal(written.length, candidates.length);
    assert.ok(written
      .filter(({ semanticFamilyId }) => semanticFamilyId === target)
      .every(({ review }) => review.status === 'human-approved'));
    assert.deepEqual(readdirSync(directory), ['candidates.jsonl']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('atomic save refuses an invalid dataset before replacing the file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ste-review-invalid-'));
  const path = join(directory, 'candidates.jsonl');
  try {
    writeFileSync(path, 'preserve me\n');
    const invalid = structuredClone(candidates);
    invalid[0]!.id = invalid[1]!.id;
    assert.throws(() => saveCandidatesAtomically(path, invalid), /Refusing to save an invalid dataset/u);
    assert.equal(readFileSync(path, 'utf8'), 'preserve me\n');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('review options reject final holdouts and missing values', () => {
  assert.equal(parseReviewOptions([]).split, 'development');
  assert.equal(parseReviewOptions(['--split', 'reserved-public']).split, 'reserved-public');
  assert.throws(() => parseReviewOptions(['--split', 'final-holdout']), /must be one of/u);
  assert.throws(() => parseReviewOptions(['--reviewer']), /requires a value/u);
});
