export interface BoundingBox {
  l: number;
  t: number;
  r: number;
  b: number;
  coord_origin?: string;
}

export interface SourceLocation {
  ref: string;
  page: number | null;
  bbox: BoundingBox | null;
}

export interface DoclingReference {
  $ref: string;
}

export interface DoclingProvenance {
  page_no?: number;
  bbox?: BoundingBox;
}

export interface DoclingTextItem {
  self_ref: string;
  label: string;
  text: string;
  prov?: DoclingProvenance[];
}

export interface DoclingTableCell {
  text: string;
  start_row_offset_idx: number;
  end_row_offset_idx: number;
  start_col_offset_idx: number;
  end_col_offset_idx: number;
  bbox?: BoundingBox;
  column_header?: boolean;
}

export interface DoclingTableItem {
  self_ref: string;
  label?: string;
  prov?: DoclingProvenance[];
  data?: {
    table_cells?: DoclingTableCell[];
  };
}

export interface DoclingPictureItem {
  self_ref: string;
  label?: string;
  prov?: DoclingProvenance[];
}

export interface DoclingGroupItem {
  self_ref: string;
  label?: string;
  name?: string;
  children?: DoclingReference[];
}

export interface DoclingDocument {
  schema_name?: string;
  version?: string;
  name?: string;
  origin?: {
    filename?: string;
    mimetype?: string;
    binary_hash?: number;
  };
  body: {
    children: DoclingReference[];
  };
  pages?: Record<string, unknown>;
  texts: DoclingTextItem[];
  tables: DoclingTableItem[];
  pictures: DoclingPictureItem[];
  groups: DoclingGroupItem[];
}

export interface OrderedTextNode {
  kind: 'text';
  ref: string;
  label: string;
  text: string;
  source: SourceLocation;
}

export interface OrderedTableNode {
  kind: 'table';
  ref: string;
  cells: DoclingTableCell[];
  source: SourceLocation;
}

export interface OrderedPictureNode {
  kind: 'picture';
  ref: string;
  label: string;
  source: SourceLocation;
}

export type OrderedNode = OrderedTextNode | OrderedTableNode | OrderedPictureNode;

export interface NormalizationRecord {
  kind:
    | 'unicode-normalization'
    | 'line-wrap-hyphen'
    | 'private-use-symbol'
    | 'source-layout-repair';
  before: string;
  after: string;
}

export interface NormalizedText {
  rawText: string;
  text: string;
  normalizations: NormalizationRecord[];
}

export interface ParsedTableBlock {
  kind: 'table';
  source: SourceLocation;
  rows: string[][];
}

export interface ParsedTextBlock {
  kind: 'paragraph' | 'heading' | 'list-item' | 'code' | 'caption' | 'footnote' | 'text';
  source: SourceLocation;
  label: string;
  rawText: string;
  text: string;
  normalizations: NormalizationRecord[];
}

export interface ParsedPictureBlock {
  kind: 'picture';
  source: SourceLocation;
  label: string;
}

export type ContentBlock = ParsedTableBlock | ParsedTextBlock | ParsedPictureBlock;

export interface RuleRecord {
  id: string;
  title: string;
  section: number;
  sectionTitle: string;
  source: SourceLocation;
  blocks: ContentBlock[];
}

export interface RuleSection {
  number: number;
  title: string;
  source: SourceLocation;
  rules: RuleRecord[];
}

export interface SubjectIndexEntry {
  subject: string;
  references: string;
  source: SourceLocation;
}

export const DICTIONARY_COLUMNS = [
  'word',
  'approvedMeaningOrAlternatives',
  'steExample',
  'nonSteExample',
] as const;

export type DictionaryColumn = (typeof DICTIONARY_COLUMNS)[number];

export interface DictionaryCell extends NormalizedText {
  sourceCells: SourceLocation[];
}

export type DictionaryCells = Record<DictionaryColumn, DictionaryCell>;

export interface DictionaryRow {
  row: number;
  tableRef: string;
  page: number | null;
  cells: DictionaryCells;
}

export type DictionaryPartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'preposition'
  | 'conjunction'
  | 'pronoun'
  | 'article'
  | 'prefix';

export interface DictionaryEntry {
  id: string;
  approved: boolean;
  headword: string;
  partOfSpeech: DictionaryPartOfSpeech;
  rawHeadwordField: string;
  formsText: string | null;
  source: SourceLocation;
  rows: DictionaryRow[];
}

export interface DictionaryStats {
  tables: number;
  physicalColumnExceptions: number;
  entries: number;
  approvedEntries: number;
  nonApprovedEntries: number;
  continuationRows: number;
}

export interface ParseIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  source?: SourceLocation;
}

export interface ParsedSteDocument {
  schemaVersion: 1;
  parserVersion: string;
  source: {
    name: string | null;
    filename: string | null;
    doclingSchema: string | null;
    doclingVersion: string | null;
    doclingJsonSha256: string | null;
    pages: number;
  };
  frontMatter: {
    blocks: ContentBlock[];
    subjectIndex: SubjectIndexEntry[];
  };
  writingRules: {
    sections: RuleSection[];
    rules: RuleRecord[];
  };
  dictionary: {
    introduction: ContentBlock[];
    entries: DictionaryEntry[];
    stats: DictionaryStats;
  };
  issues: ParseIssue[];
}
