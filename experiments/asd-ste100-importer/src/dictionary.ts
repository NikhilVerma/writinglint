import { contentBlocks } from './content.js';
import {
  isDictionaryTable,
  normalizeDictionaryTable,
  type NormalizedDictionaryTable,
} from './tables.js';
import type {
  ContentBlock,
  DictionaryEntry,
  DictionaryPartOfSpeech,
  DictionaryStats,
  DictionaryCell,
  OrderedNode,
  OrderedTableNode,
  OrderedTextNode,
  ParseIssue,
} from './types.js';

const WORD_LIST_FOOTER = 'Page 2-1-A1';
const HEADWORD_PATTERN = /^(.*?)\s+\((n|v|adj|adv|prep|conj|con|pron|art|prefix)\)(.*)$/iu;

const PART_OF_SPEECH: Record<string, DictionaryPartOfSpeech> = {
  n: 'noun',
  v: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  prep: 'preposition',
  conj: 'conjunction',
  con: 'conjunction',
  pron: 'pronoun',
  art: 'article',
  prefix: 'prefix',
};

// Docling preserves the printed line-ending hyphen but loses the line break.
// Most such hyphens are meaningful compounds, so the generic table normalizer
// keeps them. This dictionary-specific pass repairs only spellings that were
// visually checked against Issue 9.
const ISSUE_9_LAYOUT_REPAIRS = new Map([
  ['COUNTERCLOCK-WISE', 'COUNTERCLOCKWISE'],
  ['ELECTROMAG-NETICALLY', 'ELECTROMAGNETICALLY'],
  ['ELECTROMAG-NETIC', 'ELECTROMAGNETIC'],
  ['INTERCHANGE-ABLE', 'INTERCHANGEABLE'],
  ['UNSATISFAC-TORILY', 'UNSATISFACTORILY'],
  ['UNSATISFAC-TORY', 'UNSATISFACTORY'],
  ['OPER A TION', 'OPERATION'],
]);

export function repairIssue9DictionaryCell(cell: DictionaryCell): DictionaryCell {
  let text = cell.text;
  const normalizations = [...cell.normalizations];
  for (const [beforeFragment, afterFragment] of ISSUE_9_LAYOUT_REPAIRS) {
    if (!text.includes(beforeFragment)) continue;
    const before = text;
    text = text.replaceAll(beforeFragment, afterFragment);
    normalizations.push({ kind: 'source-layout-repair', before, after: text });
  }
  return { ...cell, text, normalizations };
}

function repairIssue9DictionaryTable(table: NormalizedDictionaryTable): NormalizedDictionaryTable {
  return {
    ...table,
    rows: table.rows.map((row) => ({
      ...row,
      cells: Object.fromEntries(Object.entries(row.cells).map(([column, cell]) => [
        column,
        repairIssue9DictionaryCell(cell),
      ])) as typeof row.cells,
    })),
  };
}

function textNode(node: OrderedNode): node is OrderedTextNode {
  return node.kind === 'text';
}

function tableNode(node: OrderedNode): node is OrderedTableNode {
  return node.kind === 'table';
}

export interface ParsedHeadword {
  headword: string;
  partOfSpeech: DictionaryPartOfSpeech;
  formsText: string | null;
  approved: boolean;
}

export function parseHeadwordField(value: string): ParsedHeadword | undefined {
  const match = value.trim().match(HEADWORD_PATTERN);
  if (!match) return undefined;
  const headword = match[1]!.trim();
  if (!headword) return undefined;
  const partOfSpeech = PART_OF_SPEECH[match[2]!.toLowerCase()];
  if (!partOfSpeech) return undefined;
  const firstLetter = [...headword].find((character) => /\p{L}/u.test(character));
  const approved = firstLetter !== undefined
    && firstLetter === firstLetter.toLocaleUpperCase('en-US')
    && firstLetter !== firstLetter.toLocaleLowerCase('en-US');
  const forms = match[3]!.trim().replace(/^,\s*/u, '');
  return {
    headword,
    partOfSpeech,
    formsText: forms || null,
    approved,
  };
}

function entryId(parsed: ParsedHeadword, table: NormalizedDictionaryTable, row: number): string {
  const slug = parsed.headword
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '') || 'entry';
  return `${slug}-${parsed.partOfSpeech}-p${table.page ?? 'unknown'}-r${row}`;
}

function wordListIndex(nodes: readonly OrderedNode[]): number {
  return nodes.findIndex((node) =>
    textNode(node) && node.label === 'page_footer' && node.text.trim() === WORD_LIST_FOOTER);
}

export function parseDictionary(
  nodes: readonly OrderedNode[],
  partTwoIndex: number,
  issues: ParseIssue[],
): { introduction: ContentBlock[]; entries: DictionaryEntry[]; stats: DictionaryStats } {
  const start = wordListIndex(nodes);
  if (start === -1) throw new Error(`Could not find dictionary word-list footer ${WORD_LIST_FOOTER}.`);
  if (start <= partTwoIndex) throw new Error('Dictionary word list starts before Part 2.');
  const wordListPage = nodes[start]!.source.page;
  const firstWordListNode = nodes.findIndex((node, index) =>
    index > partTwoIndex && wordListPage !== null && node.source.page !== null && node.source.page >= wordListPage);
  if (firstWordListNode === -1) throw new Error('Could not locate the first node on the dictionary word-list page.');
  const tables = nodes
    .filter(tableNode)
    .filter((node) => wordListPage !== null && node.source.page !== null && node.source.page >= wordListPage)
    .filter(isDictionaryTable)
    .map((table) => normalizeDictionaryTable(table, issues))
    .filter((table): table is NormalizedDictionaryTable => table !== undefined)
    .map(repairIssue9DictionaryTable);

  const entries: DictionaryEntry[] = [];
  let current: DictionaryEntry | undefined;
  let continuationRows = 0;

  for (const table of tables) {
    if (table.physicalColumns !== 4) {
      issues.push({
        severity: 'warning',
        code: 'dictionary-physical-column-exception',
        message: `Normalized ${table.physicalColumns} physical columns to four semantic columns.`,
        source: {
          ref: table.tableRef,
          page: table.page,
          bbox: null,
        },
      });
    }
    for (const row of table.rows) {
      const parsed = parseHeadwordField(row.cells.word.text);
      if (parsed) {
        current = {
          id: entryId(parsed, table, row.row),
          approved: parsed.approved,
          headword: parsed.headword,
          partOfSpeech: parsed.partOfSpeech,
          rawHeadwordField: row.cells.word.rawText,
          formsText: parsed.formsText,
          source: row.cells.word.sourceCells[0] ?? {
            ref: table.tableRef,
            page: table.page,
            bbox: null,
          },
          rows: [row],
        };
        entries.push(current);
        continue;
      }
      if (!current) {
        issues.push({
          severity: 'error',
          code: 'orphan-dictionary-row',
          message: `Dictionary row ${row.row} has no preceding entry.`,
          source: { ref: row.tableRef, page: row.page, bbox: null },
        });
        continue;
      }
      if (row.cells.word.text) {
        issues.push({
          severity: 'warning',
          code: 'dictionary-word-cell-annotation',
          message: `Attached unparsed word-column text to ${current.headword}: ${JSON.stringify(row.cells.word.text)}.`,
          source: row.cells.word.sourceCells[0],
        });
      }
      current.rows.push(row);
      continuationRows += 1;
    }
  }

  return {
    introduction: contentBlocks(nodes.slice(partTwoIndex + 1, firstWordListNode)),
    entries,
    stats: {
      tables: tables.length,
      physicalColumnExceptions: tables.filter(({ physicalColumns }) => physicalColumns !== 4).length,
      entries: entries.length,
      approvedEntries: entries.filter(({ approved }) => approved).length,
      nonApprovedEntries: entries.filter(({ approved }) => !approved).length,
      continuationRows,
    },
  };
}
