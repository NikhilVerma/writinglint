import { existsSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATASET_PATH,
  assignSplits,
  loadCandidates,
  validateCandidates,
  type AssignedCandidate,
  type TechnicalEnglishCandidate,
} from './dataset.js';

export const REVIEWABLE_SPLITS = ['development', 'evaluation', 'reserved-public'] as const;

export type ReviewableSplit = (typeof REVIEWABLE_SPLITS)[number];
export type ReviewDecision = 'approve' | 'reject';

export interface ReviewFamily {
  id: string;
  reference: string;
  split: ReviewableSplit;
  candidates: AssignedCandidate[];
  pendingCount: number;
}

export interface CandidateReview {
  candidateId: string;
  decision: ReviewDecision;
  reviewer: string;
  reviewedAt: string;
  notes: string;
}

interface ReviewOptions {
  input: string;
  seed: string;
  split: ReviewableSplit;
  reviewer?: string;
  family?: string;
  list: boolean;
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function requireOptionValue(args: readonly string[], name: string): string | undefined {
  const value = option(args, name);
  if (args.includes(name) && !value) throw new Error(`${name} requires a value.`);
  return value;
}

export function parseReviewOptions(args: readonly string[]): ReviewOptions {
  const requestedSplit = requireOptionValue(args, '--split') ?? 'development';
  if (!REVIEWABLE_SPLITS.includes(requestedSplit as ReviewableSplit)) {
    throw new Error(`--split must be one of: ${REVIEWABLE_SPLITS.join(', ')}.`);
  }
  return {
    input: resolve(requireOptionValue(args, '--input') ?? DATASET_PATH),
    seed: requireOptionValue(args, '--seed') ?? 'ste-eval-v1',
    split: requestedSplit as ReviewableSplit,
    reviewer: requireOptionValue(args, '--reviewer'),
    family: requireOptionValue(args, '--family'),
    list: args.includes('--list'),
  };
}

export function collectReviewFamilies(
  candidates: readonly TechnicalEnglishCandidate[],
  seed: string,
  split: ReviewableSplit,
): ReviewFamily[] {
  const assigned = assignSplits(candidates, seed).filter((candidate) => candidate.split === split);
  const grouped = new Map<string, AssignedCandidate[]>();
  for (const candidate of assigned) {
    const family = grouped.get(candidate.semanticFamilyId) ?? [];
    family.push(candidate);
    grouped.set(candidate.semanticFamilyId, family);
  }
  return [...grouped.entries()]
    .map(([id, familyCandidates]) => ({
      id,
      reference: familyCandidates[0]!.primaryReference,
      split,
      candidates: familyCandidates,
      pendingCount: familyCandidates.filter(({ review }) => review.status === 'ai-candidate').length,
    }))
    .filter(({ pendingCount }) => pendingCount > 0)
    .sort((left, right) => left.reference.localeCompare(right.reference) || left.id.localeCompare(right.id));
}

function expectedFindingLines(candidate: AssignedCandidate): string[] {
  if (!candidate.expectedFindings.length) return ['    Proposed findings: none'];
  return candidate.expectedFindings.flatMap((finding) => [
    `    Proposed rule: ${finding.ruleId} (${finding.count})`,
    ...finding.matches.map((match) =>
      `      [${match.start}, ${match.end}) ${JSON.stringify(match.text)}`),
  ]);
}

export function formatReviewFamily(family: ReviewFamily): string {
  const lines = [
    `Family ${family.id}`,
    `Reference ${family.reference} | split ${family.split} | ${family.pendingCount} pending`,
  ];
  for (const [index, candidate] of family.candidates.entries()) {
    lines.push(
      '',
      `${index + 1}. ${candidate.id}`,
      `    Proposed label: ${candidate.label} | mode: ${candidate.mode} | status: ${candidate.review.status}`,
      `    Text: ${candidate.text}`,
      ...expectedFindingLines(candidate),
    );
    if (candidate.boundary) {
      lines.push(
        `    Boundary: ${candidate.boundary.observed} ${candidate.boundary.measure} units; limit ${candidate.boundary.limit} (${candidate.boundary.relation})`,
      );
    }
    lines.push(`    Rationale: ${candidate.rationale}`);
  }
  return lines.join('\n');
}

function assertReviewRecord(record: CandidateReview): void {
  if (!record.reviewer.trim()) throw new Error('A reviewer name is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(record.reviewedAt)) {
    throw new Error('reviewedAt must use YYYY-MM-DD.');
  }
  if (!record.notes.trim()) throw new Error('Review notes are required.');
}

export function applyCandidateReviews(
  candidates: readonly TechnicalEnglishCandidate[],
  familyId: string,
  records: readonly CandidateReview[],
): TechnicalEnglishCandidate[] {
  const family = candidates.filter((candidate) => candidate.semanticFamilyId === familyId);
  if (!family.length) throw new Error(`Unknown semantic family: ${familyId}.`);
  if (!records.length) throw new Error('At least one candidate review is required.');
  const recordsById = new Map<string, CandidateReview>();
  for (const record of records) {
    assertReviewRecord(record);
    if (recordsById.has(record.candidateId)) {
      throw new Error(`Candidate ${record.candidateId} has more than one review decision.`);
    }
    const candidate = family.find(({ id }) => id === record.candidateId);
    if (!candidate) throw new Error(`Candidate ${record.candidateId} is not in semantic family ${familyId}.`);
    if (candidate.review.status !== 'ai-candidate') {
      throw new Error(`Candidate ${record.candidateId} is already ${candidate.review.status}.`);
    }
    recordsById.set(record.candidateId, record);
  }

  return candidates.map((candidate) => {
    const record = recordsById.get(candidate.id);
    if (!record) return candidate;
    return {
      ...candidate,
      review: {
        status: record.decision === 'approve' ? 'human-approved' : 'rejected',
        reviewer: record.reviewer.trim(),
        reviewedAt: record.reviewedAt,
        notes: record.notes.trim(),
      },
    };
  });
}

export function saveCandidatesAtomically(
  path: string,
  candidates: readonly TechnicalEnglishCandidate[],
): void {
  const issues = validateCandidates(candidates);
  if (issues.length) {
    throw new Error(`Refusing to save an invalid dataset:\n${issues.map(({ id, message }) => `- ${id}: ${message}`).join('\n')}`);
  }
  const temporaryPath = `${path}.review-${process.pid}-${Date.now()}.tmp`;
  const contents = `${candidates.map((candidate) => JSON.stringify(candidate)).join('\n')}\n`;
  try {
    writeFileSync(temporaryPath, contents, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporaryPath, path);
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    throw error;
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function runInteractiveReview(options: ReviewOptions): Promise<void> {
  if (!options.reviewer?.trim()) throw new Error('--reviewer is required for interactive review.');
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Interactive review requires a terminal. Use --list for a non-interactive summary.');
  }

  let candidates = loadCandidates(options.input);
  const allFamilies = collectReviewFamilies(candidates, options.seed, options.split);
  const selectedFamilies = options.family
    ? allFamilies.filter(({ id }) => id === options.family)
    : allFamilies;
  if (options.family && !selectedFamilies.length) {
    throw new Error(`No pending family named ${options.family} exists in ${options.split}.`);
  }
  if (!selectedFamilies.length) {
    console.log(`No pending families remain in ${options.split}.`);
    return;
  }

  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('Current detector output is intentionally hidden during review.');
    console.log('Use an authorized copy of ASD-STE100 Issue 9 and verify both candidates in the family.');
    for (const [index, family] of selectedFamilies.entries()) {
      console.log(`\n${'='.repeat(72)}`);
      console.log(`${index + 1}/${selectedFamilies.length}`);
      console.log(formatReviewFamily(family));
      const reviews: CandidateReview[] = [];
      let shouldQuit = false;
      for (const candidate of family.candidates.filter(({ review }) => review.status === 'ai-candidate')) {
        const answer = (await input.question(
          `\nDecision for ${candidate.id}: [a]pprove, [r]eject, [s]kip, [q]uit: `,
        )).trim().toLowerCase();
        if (answer === 'q' || answer === 'quit') {
          shouldQuit = true;
          break;
        }
        if (answer === 's' || answer === 'skip' || !answer) continue;
        const decision = answer === 'a' || answer === 'approve'
          ? 'approve'
          : answer === 'r' || answer === 'reject'
            ? 'reject'
            : undefined;
        if (!decision) {
          console.log('Unknown decision. The candidate was left unchanged.');
          continue;
        }
        const notes = await input.question(`Review notes for ${candidate.id} (required): `);
        if (!notes.trim()) {
          console.log('No notes were entered. The candidate was left unchanged.');
          continue;
        }
        reviews.push({
          candidateId: candidate.id,
          decision,
          reviewer: options.reviewer,
          reviewedAt: today(),
          notes,
        });
      }
      if (reviews.length) {
        const confirmation = (await input.question(
          `Save ${reviews.length} candidate decision(s) for ${family.id}? [y/N]: `,
        )).trim().toLowerCase();
        if (confirmation === 'y' || confirmation === 'yes') {
          candidates = applyCandidateReviews(candidates, family.id, reviews);
          saveCandidatesAtomically(options.input, candidates);
          console.log(`Saved ${reviews.length} decision(s) for ${family.id}.`);
        } else {
          console.log('The candidate decisions were not saved.');
        }
      }
      if (shouldQuit) break;
    }
  } finally {
    input.close();
  }
}

export async function runReviewCli(args = process.argv.slice(2)): Promise<void> {
  const options = parseReviewOptions(args);
  const candidates = loadCandidates(options.input);
  const families = collectReviewFamilies(candidates, options.seed, options.split)
    .filter(({ id }) => !options.family || id === options.family);
  if (options.list) {
    console.log(`${options.split}: ${families.length} pending semantic families`);
    for (const family of families) {
      console.log(`  ${family.reference}  ${family.id}  ${family.pendingCount} candidates`);
    }
    return;
  }
  await runInteractiveReview(options);
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (entrypoint === fileURLToPath(import.meta.url)) {
  await runReviewCli();
}
