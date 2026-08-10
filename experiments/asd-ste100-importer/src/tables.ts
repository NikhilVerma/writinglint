import {
  DICTIONARY_COLUMNS,
  type DictionaryCell,
  type DictionaryCells,
  type DictionaryColumn,
  type DictionaryRow,
  type DoclingTableCell,
  type NormalizationRecord,
  type NormalizedText,
  type OrderedTableNode,
  type ParseIssue,
  type SourceLocation,
} from './types.js';

export const DICTIONARY_HEADER_LABELS: Record<DictionaryColumn, string> = {
  word: 'Word (part of speech)',
  approvedMeaningOrAlternatives: 'Approved meaning/ ALTERNATIVES',
  steExample: 'STE EXAMPLE',
  nonSteExample: 'Non-STE example',
};

const PRIVATE_USE_SYMBOLS = new Map([
  ['\uF0B0', '°'],
]);

export function normalizeExtractedText(rawText: string): NormalizedText {
  let text = rawText;
  const normalizations: NormalizationRecord[] = [];

  const unicode = text.normalize('NFKC');
  if (unicode !== text) {
    normalizations.push({ kind: 'unicode-normalization', before: text, after: unicode });
    text = unicode;
  }

  for (const [symbol, replacement] of PRIVATE_USE_SYMBOLS) {
    if (!text.includes(symbol)) continue;
    const before = text;
    text = text.replaceAll(symbol, replacement);
    normalizations.push({ kind: 'private-use-symbol', before, after: text });
  }

  const joined = text.replace(/([\p{L}\p{N}])-\s+([\p{L}\p{N}])/gu, '$1-$2');
  if (joined !== text) {
    normalizations.push({ kind: 'line-wrap-hyphen', before: text, after: joined });
    text = joined;
  }

  return { rawText, text, normalizations };
}

function emptyCell(): DictionaryCell {
  return { rawText: '', text: '', normalizations: [], sourceCells: [] };
}

function sourceForCell(table: OrderedTableNode, cell: DoclingTableCell): SourceLocation {
  return {
    ref: `${table.ref}/cells/${cell.start_row_offset_idx}:${cell.start_col_offset_idx}`,
    page: table.source.page,
    bbox: cell.bbox ?? table.source.bbox,
  };
}

function mergeCells(table: OrderedTableNode, cells: readonly DoclingTableCell[]): DictionaryCell {
  const ordered = [...cells].sort((left, right) =>
    left.start_col_offset_idx - right.start_col_offset_idx
      || (left.bbox?.t ?? 0) - (right.bbox?.t ?? 0)
      || (left.bbox?.l ?? 0) - (right.bbox?.l ?? 0));
  const fragments = ordered.map(({ text }) => text.trim()).filter(Boolean);
  const deduplicated = fragments.filter((text, index) => index === 0 || text !== fragments[index - 1]);
  const normalized = normalizeExtractedText(deduplicated.join('\n'));
  return {
    ...normalized,
    sourceCells: ordered.map((cell) => sourceForCell(table, cell)),
  };
}

interface HeaderInterval {
  column: DictionaryColumn;
  start: number;
  end: number;
}

function dictionaryHeaderIntervals(table: OrderedTableNode): HeaderInterval[] | undefined {
  const intervals: HeaderInterval[] = [];
  for (const column of DICTIONARY_COLUMNS) {
    const label = DICTIONARY_HEADER_LABELS[column];
    const cell = table.cells.find((candidate) =>
      candidate.start_row_offset_idx === 0 && candidate.text.trim() === label);
    if (!cell) return undefined;
    intervals.push({
      column,
      start: cell.start_col_offset_idx,
      end: cell.end_col_offset_idx,
    });
  }
  return intervals;
}

export function isDictionaryTable(table: OrderedTableNode): boolean {
  return dictionaryHeaderIntervals(table) !== undefined;
}

function intervalForCell(
  cell: DoclingTableCell,
  intervals: readonly HeaderInterval[],
): HeaderInterval | undefined {
  const contained = intervals.find(({ start, end }) =>
    cell.start_col_offset_idx >= start && cell.end_col_offset_idx <= end);
  if (contained) return contained;
  return [...intervals]
    .map((interval) => ({
      interval,
      overlap: Math.max(0, Math.min(cell.end_col_offset_idx, interval.end)
        - Math.max(cell.start_col_offset_idx, interval.start)),
    }))
    .sort((left, right) => right.overlap - left.overlap)[0]?.interval;
}

export interface NormalizedDictionaryTable {
  tableRef: string;
  page: number | null;
  physicalColumns: number;
  rows: DictionaryRow[];
}

export function normalizeDictionaryTable(
  table: OrderedTableNode,
  issues: ParseIssue[],
): NormalizedDictionaryTable | undefined {
  const intervals = dictionaryHeaderIntervals(table);
  if (!intervals) return undefined;
  const physicalColumns = table.cells.length
    ? Math.max(...table.cells.map(({ end_col_offset_idx }) => end_col_offset_idx))
    : 0;
  const rowCount = table.cells.length
    ? Math.max(...table.cells.map(({ end_row_offset_idx }) => end_row_offset_idx))
    : 0;
  const rows: DictionaryRow[] = [];

  for (let row = 1; row < rowCount; row += 1) {
    const rowCells = table.cells.filter((cell) => cell.start_row_offset_idx === row);
    const grouped = new Map<DictionaryColumn, DoclingTableCell[]>();
    for (const cell of rowCells) {
      const interval = intervalForCell(cell, intervals);
      if (!interval) {
        issues.push({
          severity: 'warning',
          code: 'dictionary-cell-without-column',
          message: `Could not map table cell at row ${row} to a semantic dictionary column.`,
          source: sourceForCell(table, cell),
        });
        continue;
      }
      const cells = grouped.get(interval.column) ?? [];
      cells.push(cell);
      grouped.set(interval.column, cells);
    }
    const cells = Object.fromEntries(DICTIONARY_COLUMNS.map((column) => [
      column,
      grouped.has(column) ? mergeCells(table, grouped.get(column)!) : emptyCell(),
    ])) as DictionaryCells;
    if (DICTIONARY_COLUMNS.some((column) => cells[column].rawText)) {
      rows.push({ row, tableRef: table.ref, page: table.source.page, cells });
    }
  }

  return { tableRef: table.ref, page: table.source.page, physicalColumns, rows };
}

export function tableToMatrix(table: OrderedTableNode): string[][] {
  if (!table.cells.length) return [];
  const rows = Math.max(...table.cells.map(({ end_row_offset_idx }) => end_row_offset_idx));
  const columns = Math.max(...table.cells.map(({ end_col_offset_idx }) => end_col_offset_idx));
  const matrix = Array.from({ length: rows }, () => Array.from({ length: columns }, () => ''));
  for (const cell of table.cells) {
    const normalized = normalizeExtractedText(cell.text).text;
    matrix[cell.start_row_offset_idx]![cell.start_col_offset_idx] = normalized;
  }
  return matrix;
}
