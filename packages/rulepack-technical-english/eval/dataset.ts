import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DATASET_PATH = fileURLToPath(new URL('./candidates.jsonl', import.meta.url));

export const STANDARD_REFERENCES = ['3.6', '4.2', '5.1', '6.3', '6.6', '8.1'] as const;
export const TECHNICAL_MODES = ['descriptive', 'procedural'] as const;
export const CANDIDATE_LABELS = ['finding', 'clear'] as const;
export const REVIEW_STATUSES = ['ai-candidate', 'human-approved', 'rejected'] as const;
export const EVALUATION_POOLS = ['rotation', 'reserved-public', 'external-final'] as const;

export type StandardReference = (typeof STANDARD_REFERENCES)[number];
export type TechnicalMode = (typeof TECHNICAL_MODES)[number];
export type CandidateLabel = (typeof CANDIDATE_LABELS)[number];
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export type EvaluationPool = (typeof EVALUATION_POOLS)[number];
export type EvaluationSplit = 'development' | 'evaluation' | 'reserved-public' | 'final-holdout';

export interface ExpectedMatch {
  text: string;
  /** Inclusive document-global UTF-16 code-unit offset, matching WritingLint. */
  start: number;
  /** Exclusive document-global UTF-16 code-unit offset, matching WritingLint. */
  end: number;
}

export interface ExpectedFinding {
  ruleId: string;
  count: number;
  matches: ExpectedMatch[];
}

export interface BoundaryMetadata {
  measure: 'word-count' | 'sentence-count';
  observed: number;
  limit: number;
  relation: 'below-limit' | 'at-limit' | 'over-limit';
}

export interface TechnicalEnglishCandidate {
  schemaVersion: 1;
  id: string;
  text: string;
  mode: TechnicalMode;
  primaryReference: StandardReference;
  label: CandidateLabel;
  semanticFamilyId: string;
  templateGroupId: string;
  expectedFindings: ExpectedFinding[];
  boundary: BoundaryMetadata | null;
  rationale: string;
  provenance: {
    kind: 'synthetic';
    origin: 'independently-authored';
    copiedFromStandard: false;
    authorType: 'ai';
    authorId: string;
    authoredAt: string;
  };
  review: {
    status: ReviewStatus;
    reviewer: string | null;
    reviewedAt: string | null;
    notes: string | null;
  };
  evaluation: {
    pool: EvaluationPool;
  };
}

export interface AssignedCandidate extends TechnicalEnglishCandidate {
  split: EvaluationSplit;
}

export interface ValidationIssue {
  id: string;
  message: string;
}

const REFERENCE_RULES: Record<StandardReference, string> = {
  '3.6': 'technical-english/passive-voice',
  '4.2': 'technical-english/no-contractions',
  '5.1': 'technical-english/sentence-length',
  '6.3': 'technical-english/sentence-length',
  '6.6': 'technical-english/paragraph-length',
  '8.1': 'technical-english/no-semicolon',
};

const BOUNDARY_REQUIREMENTS: Partial<Record<StandardReference, {
  measure: BoundaryMetadata['measure'];
  limit: number;
  mode: TechnicalMode;
}>> = {
  '5.1': { measure: 'word-count', limit: 20, mode: 'procedural' },
  '6.3': { measure: 'word-count', limit: 25, mode: 'descriptive' },
  '6.6': { measure: 'sentence-count', limit: 6, mode: 'descriptive' },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseJsonLine(line: string, lineNumber: number): TechnicalEnglishCandidate {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON on candidates.jsonl line ${lineNumber}: ${detail}`);
  }
  if (!isRecord(value)) throw new Error(`Expected an object on candidates.jsonl line ${lineNumber}.`);
  return value as unknown as TechnicalEnglishCandidate;
}

export function loadCandidates(path = DATASET_PATH): TechnicalEnglishCandidate[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => parseJsonLine(line, index + 1));
}

/** Rejected rows are never evaluable, including provisional unreviewed runs. */
export function selectEvaluableCandidates(
  candidates: readonly AssignedCandidate[],
  allowUnreviewed: boolean,
  split: EvaluationSplit = 'development',
): AssignedCandidate[] {
  if (split === 'final-holdout' && allowUnreviewed) {
    throw new Error('The final holdout requires human-approved candidates.');
  }
  return candidates.filter((candidate) => candidate.review.status === 'human-approved'
    || (allowUnreviewed && candidate.review.status === 'ai-candidate'));
}

function wordCount(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function sentenceCount(text: string): number {
  return text.match(/[.!?](?=\s|$)/gu)?.length ?? 0;
}

function relationFor(observed: number, limit: number): BoundaryMetadata['relation'] {
  if (observed < limit) return 'below-limit';
  if (observed === limit) return 'at-limit';
  return 'over-limit';
}

export function validateCandidates(candidates: readonly TechnicalEnglishCandidate[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  const texts = new Map<string, string>();
  const familyPools = new Map<string, EvaluationPool>();
  const familyReferences = new Map<string, StandardReference>();
  const templateFamilies = new Map<string, string>();

  const issue = (id: string, message: string): void => {
    issues.push({ id, message });
  };

  for (const candidate of candidates) {
    const id = typeof candidate.id === 'string' ? candidate.id : '<missing-id>';
    if (candidate.schemaVersion !== 1) issue(id, 'schemaVersion must be 1.');
    if (!candidate.id || !/^[a-z0-9][a-z0-9-]+$/u.test(candidate.id)) issue(id, 'id must be a non-empty kebab-case identifier.');
    if (ids.has(candidate.id)) issue(id, 'id is duplicated.');
    ids.add(candidate.id);

    if (typeof candidate.text !== 'string' || !candidate.text.trim()) {
      issue(id, 'text must be non-empty.');
    } else {
      const normalized = candidate.text.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US');
      const prior = texts.get(normalized);
      if (prior) issue(id, `text duplicates ${prior} after normalization.`);
      else texts.set(normalized, id);
    }

    if (!TECHNICAL_MODES.includes(candidate.mode)) issue(id, `invalid mode: ${String(candidate.mode)}.`);
    if (!STANDARD_REFERENCES.includes(candidate.primaryReference)) {
      issue(id, `invalid primaryReference: ${String(candidate.primaryReference)}.`);
      continue;
    }
    if (candidate.semanticFamilyId) {
      const priorReference = familyReferences.get(candidate.semanticFamilyId);
      if (priorReference && priorReference !== candidate.primaryReference) {
        issue(id, 'a semantic family cannot span standard references.');
      }
      familyReferences.set(candidate.semanticFamilyId, candidate.primaryReference);
    }
    if (!CANDIDATE_LABELS.includes(candidate.label)) issue(id, `invalid label: ${String(candidate.label)}.`);
    if (!candidate.semanticFamilyId) issue(id, 'semanticFamilyId is required.');
    if (!candidate.templateGroupId) issue(id, 'templateGroupId is required.');
    if (typeof candidate.rationale !== 'string' || candidate.rationale.trim().length < 20) {
      issue(id, 'rationale must explain the judgment in at least 20 characters.');
    }

    if (!Array.isArray(candidate.expectedFindings)) {
      issue(id, 'expectedFindings must be an array.');
    } else {
      const expectedRule = REFERENCE_RULES[candidate.primaryReference];
      for (const finding of candidate.expectedFindings) {
        if (finding.ruleId !== expectedRule) issue(id, `unexpected ruleId ${finding.ruleId}; expected ${expectedRule}.`);
        if (!Number.isInteger(finding.count) || finding.count < 1) issue(id, 'finding count must be a positive integer.');
        if (!Array.isArray(finding.matches) || finding.matches.length !== finding.count) {
          issue(id, 'finding matches must contain one exact source span for each expected finding.');
        } else {
          for (const match of finding.matches) {
            if (!isRecord(match)
              || typeof match.text !== 'string'
              || !match.text
              || !Number.isInteger(match.start)
              || !Number.isInteger(match.end)
              || match.start < 0
              || match.end <= match.start
              || match.end > candidate.text.length) {
              issue(id, 'every expected match needs a valid non-empty UTF-16 start/end range.');
            } else if (candidate.text.slice(match.start, match.end) !== match.text) {
              issue(id, 'expected match text does not equal the source text at its UTF-16 range.');
            }
          }
        }
      }
      if (candidate.label === 'finding' && candidate.expectedFindings.length === 0) {
        issue(id, 'finding labels require at least one expected finding.');
      }
      if (candidate.label === 'clear' && candidate.expectedFindings.length !== 0) {
        issue(id, 'clear labels cannot have expected findings.');
      }
    }

    const requirement = BOUNDARY_REQUIREMENTS[candidate.primaryReference];
    if (candidate.boundary) {
      if (!requirement) {
        issue(id, `boundary metadata is not supported for reference ${candidate.primaryReference}.`);
      } else {
        const actual = candidate.boundary.measure === 'word-count'
          ? wordCount(candidate.text)
          : sentenceCount(candidate.text);
        if (candidate.mode !== requirement.mode) issue(id, `reference ${candidate.primaryReference} requires ${requirement.mode} mode.`);
        if (candidate.boundary.measure !== requirement.measure) issue(id, `boundary measure must be ${requirement.measure}.`);
        if (candidate.boundary.limit !== requirement.limit) issue(id, `boundary limit must be ${requirement.limit}.`);
        if (candidate.boundary.observed !== actual) issue(id, `boundary observed ${candidate.boundary.observed} does not match measured ${actual}.`);
        if (candidate.boundary.relation !== relationFor(candidate.boundary.observed, candidate.boundary.limit)) {
          issue(id, 'boundary relation does not agree with observed and limit.');
        }
        const shouldFind = candidate.boundary.observed > candidate.boundary.limit;
        if ((candidate.label === 'finding') !== shouldFind) issue(id, 'boundary label does not agree with observed and limit.');
      }
    } else if (requirement) {
      issue(id, `reference ${candidate.primaryReference} requires boundary metadata.`);
    }

    if (!isRecord(candidate.provenance)
      || candidate.provenance.kind !== 'synthetic'
      || candidate.provenance.origin !== 'independently-authored'
      || candidate.provenance.copiedFromStandard !== false
      || candidate.provenance.authorType !== 'ai'
      || !candidate.provenance.authorId
      || !/^\d{4}-\d{2}-\d{2}$/u.test(candidate.provenance.authoredAt)) {
      issue(id, 'provenance must identify a synthetic AI-authored candidate that was not copied from the standard.');
    }

    if (!isRecord(candidate.review) || !REVIEW_STATUSES.includes(candidate.review.status)) {
      issue(id, 'review status is missing or invalid.');
    } else if (candidate.review.status === 'ai-candidate'
      && (candidate.review.reviewer !== null || candidate.review.reviewedAt !== null)) {
      issue(id, 'an unreviewed AI candidate cannot name a reviewer or review date.');
    } else if (candidate.review.status === 'human-approved'
      && (!candidate.review.reviewer || !candidate.review.reviewedAt)) {
      issue(id, 'a human-approved candidate requires a reviewer and review date.');
    } else if (candidate.review.status === 'rejected'
      && (!candidate.review.reviewer || !candidate.review.reviewedAt || !candidate.review.notes)) {
      issue(id, 'a rejected candidate requires a reviewer, review date, and reason.');
    }

    if (!isRecord(candidate.evaluation) || !EVALUATION_POOLS.includes(candidate.evaluation.pool)) {
      issue(id, 'evaluation pool is missing or invalid.');
    } else if (candidate.semanticFamilyId) {
      const priorPool = familyPools.get(candidate.semanticFamilyId);
      if (priorPool && priorPool !== candidate.evaluation.pool) issue(id, 'a semantic family cannot span evaluation pools.');
      familyPools.set(candidate.semanticFamilyId, candidate.evaluation.pool);
    }

    if (candidate.templateGroupId && candidate.semanticFamilyId) {
      const priorFamily = templateFamilies.get(candidate.templateGroupId);
      if (priorFamily && priorFamily !== candidate.semanticFamilyId) issue(id, 'a template group cannot span semantic families.');
      templateFamilies.set(candidate.templateGroupId, candidate.semanticFamilyId);
    }
  }

  return issues;
}

function hash(seed: string, value: string): string {
  return createHash('sha256').update(`${seed}\0${value}`).digest('hex');
}

export function assignSplits(
  candidates: readonly TechnicalEnglishCandidate[],
  seed: string,
): AssignedCandidate[] {
  if (!seed.trim()) throw new Error('A non-empty split seed is required.');
  const issues = validateCandidates(candidates);
  if (issues.length) throw new Error(`Dataset validation failed:\n${issues.map(({ id, message }) => `- ${id}: ${message}`).join('\n')}`);

  const familyReference = new Map<string, StandardReference>();
  for (const candidate of candidates) {
    if (candidate.evaluation.pool === 'rotation') familyReference.set(candidate.semanticFamilyId, candidate.primaryReference);
  }

  const evaluationFamilies = new Set<string>();
  for (const reference of STANDARD_REFERENCES) {
    const families = [...familyReference]
      .filter(([, familyReferenceValue]) => familyReferenceValue === reference)
      .map(([family]) => family)
      .sort((left, right) => hash(seed, left).localeCompare(hash(seed, right)));
    if (families.length > 1) {
      const evaluationCount = Math.max(1, Math.floor(families.length / 3));
      for (const family of families.slice(0, evaluationCount)) evaluationFamilies.add(family);
    }
  }

  return candidates.map((candidate) => ({
    ...candidate,
    split: candidate.evaluation.pool === 'external-final'
      ? 'final-holdout'
      : candidate.evaluation.pool === 'reserved-public'
        ? 'reserved-public'
        : evaluationFamilies.has(candidate.semanticFamilyId) ? 'evaluation' : 'development',
  }));
}
