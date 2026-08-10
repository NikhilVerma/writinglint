import { documentPageCount, orderedNodes } from './docling.js';
import { parseDictionary } from './dictionary.js';
import { parseFrontMatter } from './front-matter.js';
import { parseWritingRules } from './rules.js';
import type { DoclingDocument, ParseIssue, ParsedSteDocument } from './types.js';

export const PARSER_VERSION = '0.1.0';

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
];

function validateIssue9(result: ParsedSteDocument): void {
  const expected = new Set(ISSUE_9_RULE_IDS);
  const actual = new Set(result.writingRules.rules.map(({ id }) => id));
  for (const id of expected) {
    if (!actual.has(id)) {
      result.issues.push({ severity: 'error', code: 'missing-rule', message: `Rule ${id} was not parsed.` });
    }
  }
  for (const id of actual) {
    if (!expected.has(id)) {
      result.issues.push({ severity: 'error', code: 'unexpected-rule', message: `Unexpected rule ${id} was parsed.` });
    }
  }
  if (result.source.pages !== 434) {
    result.issues.push({
      severity: 'error',
      code: 'unexpected-page-count',
      message: `Expected 434 pages for Issue 9, found ${result.source.pages}.`,
    });
  }
  if (result.dictionary.stats.approvedEntries !== 875) {
    result.issues.push({
      severity: 'error',
      code: 'unexpected-approved-entry-count',
      message: `Expected 875 approved dictionary entries, found ${result.dictionary.stats.approvedEntries}.`,
    });
  }
  if (result.dictionary.stats.tables !== 275) {
    result.issues.push({
      severity: 'error',
      code: 'unexpected-dictionary-table-count',
      message: `Expected 275 dictionary tables, found ${result.dictionary.stats.tables}.`,
    });
  }
  if (result.dictionary.stats.entries !== 2190) {
    result.issues.push({
      severity: 'error',
      code: 'unexpected-dictionary-entry-count',
      message: `Expected 2190 part-of-speech entries, found ${result.dictionary.stats.entries}.`,
    });
  }
  const entryIds = new Set<string>();
  for (const entry of result.dictionary.entries) {
    if (entryIds.has(entry.id)) {
      result.issues.push({
        severity: 'error',
        code: 'duplicate-entry-id',
        message: `Dictionary entry ID is duplicated: ${entry.id}.`,
        source: entry.source,
      });
    }
    entryIds.add(entry.id);
  }
}

export function parseSteDocument(
  document: DoclingDocument,
  options: { validateIssue9?: boolean } = {},
): ParsedSteDocument {
  const nodes = orderedNodes(document);
  const issues: ParseIssue[] = [];
  const writingRules = parseWritingRules(nodes, issues);
  const frontMatter = parseFrontMatter(nodes, writingRules.boundaries.partOne);
  const dictionary = parseDictionary(nodes, writingRules.boundaries.partTwo, issues);
  const result: ParsedSteDocument = {
    schemaVersion: 1,
    parserVersion: PARSER_VERSION,
    source: {
      name: document.name ?? null,
      filename: document.origin?.filename ?? null,
      doclingSchema: document.schema_name ?? null,
      doclingVersion: document.version ?? null,
      doclingJsonSha256: null,
      pages: documentPageCount(document),
    },
    frontMatter,
    writingRules: {
      sections: writingRules.sections,
      rules: writingRules.rules,
    },
    dictionary,
    issues,
  };
  if (options.validateIssue9 !== false) validateIssue9(result);
  return result;
}
