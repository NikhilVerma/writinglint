import {
  InMemoryTerminologyProvider,
  type TerminologyProvider,
  type TerminologyRecord,
} from 'writinglint-core';

export const ISSUE_9_RULE_IDS = [
  ...Array.from({ length: 14 }, (_, index) => `1.${index + 1}`),
  ...Array.from({ length: 2 }, (_, index) => `2.${index + 1}`),
  ...Array.from({ length: 7 }, (_, index) => `3.${index + 1}`),
  ...Array.from({ length: 5 }, (_, index) => `4.${index + 1}`),
  ...Array.from({ length: 5 }, (_, index) => `5.${index + 1}`),
  ...Array.from({ length: 6 }, (_, index) => `6.${index + 1}`),
  ...Array.from({ length: 3 }, (_, index) => `7.${index + 1}`),
  ...Array.from({ length: 7 }, (_, index) => `8.${index + 1}`),
  ...Array.from({ length: 4 }, (_, index) => `9.${index + 1}`),
] as const;

export type Issue9RuleId = (typeof ISSUE_9_RULE_IDS)[number];

export type TerminologyPartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'preposition'
  | 'conjunction'
  | 'pronoun'
  | 'article'
  | 'prefix';

export interface TerminologySource {
  ref: string;
  page: number | null;
}

export interface TerminologyEntry {
  headword: string;
  approved: boolean;
  partOfSpeech: TerminologyPartOfSpeech;
  forms: readonly string[];
  source: TerminologySource;
}

export interface AsdSte100Issue9StandardData {
  schemaVersion: 1;
  standard: 'ASD-STE100';
  issue: 9;
  source: {
    filename: string;
    pages: 434;
    doclingJsonSha256: string;
    parserVersion: string;
  };
  rules: readonly Issue9RuleId[];
  terminology: {
    provider: 'user-supplied-asd-ste100-issue-9';
    entries: readonly TerminologyEntry[];
    approvedEntries: 875;
  };
}

interface ParsedDictionaryEntry {
  headword?: unknown;
  approved?: unknown;
  partOfSpeech?: unknown;
  formsText?: unknown;
  source?: { ref?: unknown; page?: unknown };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

const PARTS_OF_SPEECH = new Set<TerminologyPartOfSpeech>([
  'noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'article', 'prefix',
]);

function formsOf(entry: ParsedDictionaryEntry): string[] {
  if (typeof entry.formsText !== 'string') return [];
  return entry.formsText
    .split(',')
    .map((form) => form.trim())
    .filter((form) => /^[-\p{L}]+$/u.test(form));
}

function terminologyEntry(value: unknown, index: number): TerminologyEntry {
  const entry = record(value, `dictionary.entries[${index}]`) as ParsedDictionaryEntry;
  const headword = string(entry.headword, `dictionary.entries[${index}].headword`);
  if (typeof entry.approved !== 'boolean') {
    throw new Error(`dictionary.entries[${index}].approved must be boolean.`);
  }
  const partOfSpeech = string(entry.partOfSpeech, `dictionary.entries[${index}].partOfSpeech`) as TerminologyPartOfSpeech;
  if (!PARTS_OF_SPEECH.has(partOfSpeech)) {
    throw new Error(`dictionary.entries[${index}].partOfSpeech is not supported: ${partOfSpeech}.`);
  }
  const source = record(entry.source, `dictionary.entries[${index}].source`);
  const page = source.page;
  if (page !== null && (!Number.isInteger(page) || Number(page) < 1)) {
    throw new Error(`dictionary.entries[${index}].source.page must be a positive integer or null.`);
  }
  return {
    headword,
    approved: entry.approved,
    partOfSpeech,
    forms: formsOf(entry),
    source: {
      ref: string(source.ref, `dictionary.entries[${index}].source.ref`),
      page: page as number | null,
    },
  };
}

/**
 * Validate the local parser output before a product treats it as Issue 9 data.
 * The returned object is smaller and contains only the fields used at runtime.
 */
export function parseAsdSte100Issue9StandardData(value: unknown): AsdSte100Issue9StandardData {
  const parsed = record(value, 'standard data');
  if (parsed.schemaVersion !== 1) throw new Error('standard data schemaVersion must be 1.');
  const parseIssues = array(parsed.issues ?? [], 'issues').map((item, index) =>
    record(item, `issues[${index}]`));
  const parseErrors = parseIssues.filter((issue) => issue.severity === 'error');
  if (parseErrors.length) {
    throw new Error(`The parser reported ${parseErrors.length} error${parseErrors.length === 1 ? '' : 's'}; standard data was not loaded.`);
  }
  const source = record(parsed.source, 'source');
  if (source.pages !== 434) throw new Error(`Issue 9 must have 434 pages; found ${String(source.pages)}.`);
  const writingRules = record(parsed.writingRules, 'writingRules');
  const parsedRules = array(writingRules.rules, 'writingRules.rules').map((item, index) => {
    const rule = record(item, `writingRules.rules[${index}]`);
    return string(rule.id, `writingRules.rules[${index}].id`);
  });
  const expectedRules = new Set<string>(ISSUE_9_RULE_IDS);
  if (parsedRules.length !== ISSUE_9_RULE_IDS.length
    || new Set(parsedRules).size !== ISSUE_9_RULE_IDS.length
    || parsedRules.some((id) => !expectedRules.has(id))) {
    throw new Error('The parsed rule catalogue does not contain each of the 53 Issue 9 references exactly once.');
  }
  const sections = array(writingRules.sections, 'writingRules.sections');
  if (sections.length !== 9) throw new Error(`Issue 9 must have nine rule sections; found ${sections.length}.`);

  const dictionary = record(parsed.dictionary, 'dictionary');
  const stats = record(dictionary.stats, 'dictionary.stats');
  if (stats.tables !== 275) throw new Error(`Issue 9 must have 275 dictionary tables; found ${String(stats.tables)}.`);
  if (stats.entries !== 2190) throw new Error(`Issue 9 must have 2190 part-of-speech entries; found ${String(stats.entries)}.`);
  if (stats.approvedEntries !== 875) throw new Error(`Issue 9 must have 875 approved entries; found ${String(stats.approvedEntries)}.`);
  const entries = array(dictionary.entries, 'dictionary.entries').map(terminologyEntry);
  if (entries.length !== 2190) throw new Error(`dictionary.entries contains ${entries.length} rows; expected 2190.`);
  if (entries.filter(({ approved }) => approved).length !== 875) {
    throw new Error('dictionary.entries does not contain exactly 875 approved entries.');
  }

  const doclingJsonSha256 = string(source.doclingJsonSha256, 'source.doclingJsonSha256');
  if (!/^[a-f0-9]{64}$/u.test(doclingJsonSha256)) {
    throw new Error('source.doclingJsonSha256 must be a lowercase SHA-256 digest.');
  }
  return {
    schemaVersion: 1,
    standard: 'ASD-STE100',
    issue: 9,
    source: {
      filename: string(source.filename, 'source.filename'),
      pages: 434,
      doclingJsonSha256,
      parserVersion: string(parsed.parserVersion, 'parserVersion'),
    },
    rules: parsedRules as Issue9RuleId[],
    terminology: {
      provider: 'user-supplied-asd-ste100-issue-9',
      entries,
      approvedEntries: 875,
    },
  };
}

export function terminologyFingerprint(data: AsdSte100Issue9StandardData): string {
  return `sha256:${data.source.doclingJsonSha256}`;
}

const PROVIDER_CACHE = new WeakMap<AsdSte100Issue9StandardData, TerminologyProvider>();

/** Adapt the licensed, user-supplied dataset to WritingLint's generic provider contract. */
export function asdSte100TerminologyProvider(data: AsdSte100Issue9StandardData): TerminologyProvider {
  const cached = PROVIDER_CACHE.get(data);
  if (cached) return cached;
  const records: TerminologyRecord[] = data.terminology.entries.map((entry, index) => ({
    id: `${entry.source.ref}:${index}`,
    term: entry.headword,
    status: entry.approved ? 'approved' : 'unapproved',
    language: 'en',
    surfaces: entry.approved ? entry.forms : [],
    partsOfSpeech: [entry.partOfSpeech],
    provenance: {
      source: 'ASD-STE100',
      reference: entry.source.ref,
      page: entry.source.page,
      version: 'Issue 9',
      fingerprint: terminologyFingerprint(data),
    },
  }));
  const provider = new InMemoryTerminologyProvider({
    id: data.terminology.provider,
    layer: 'standard',
    languages: ['en'],
    version: '9',
    fingerprint: terminologyFingerprint(data),
  }, records);
  PROVIDER_CACHE.set(data, provider);
  return provider;
}
