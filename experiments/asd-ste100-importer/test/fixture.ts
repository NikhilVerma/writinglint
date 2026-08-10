import type {
  DoclingDocument,
  DoclingTableCell,
  DoclingTableItem,
  DoclingTextItem,
} from '../src/types.js';

function text(index: number, value: string, label: string, page: number): DoclingTextItem {
  return {
    self_ref: `#/texts/${index}`,
    label,
    text: value,
    prov: [{ page_no: page }],
  };
}

function cell(
  textValue: string,
  row: number,
  startColumn: number,
  endColumn = startColumn + 1,
): DoclingTableCell {
  return {
    text: textValue,
    start_row_offset_idx: row,
    end_row_offset_idx: row + 1,
    start_col_offset_idx: startColumn,
    end_col_offset_idx: endColumn,
  };
}

function table(index: number, page: number, cells: DoclingTableCell[]): DoclingTableItem {
  return {
    self_ref: `#/tables/${index}`,
    prov: [{ page_no: page }],
    data: { table_cells: cells },
  };
}

const dictionaryHeaders = [
  cell('Word (part of speech)', 0, 0),
  cell('Approved meaning/ ALTERNATIVES', 0, 1),
  cell('STE EXAMPLE', 0, 2),
  cell('Non-STE example', 0, 3),
];

export function syntheticDoclingDocument(): DoclingDocument {
  const texts = [
    text(0, 'Subject-to-rule index', 'section_header', 1),
    text(1, 'Part 1 - Writing rules', 'section_header', 2),
    text(2, 'Section 1 - Words', 'section_header', 2),
    text(3, 'Rule 1.1 Use approved words.', 'text', 2),
    text(4, 'Rule 1.1 Use approved words.', 'section_header', 2),
    text(5, 'This is the full explanation.', 'text', 2),
    text(6, 'Section 2 - Multi-word nouns', 'section_header', 3),
    text(7, 'Rule 2.1 Keep noun groups short.', 'section_header', 3),
    text(8, 'First rule content.', 'text', 3),
    text(9, 'Rule 2.2 Clarify long noun groups.', 'list_item', 3),
    text(10, 'Second rule content.', 'text', 3),
    text(11, 'Part 2 - Dictionary', 'section_header', 4),
    text(12, 'Dictionary introduction.', 'text', 4),
    text(13, 'Page 2-1-A1', 'page_footer', 5),
  ];
  const tables = [
    table(0, 1, [
      cell('Subject', 0, 0),
      cell('Rule', 0, 1),
      cell('Approved words', 1, 0),
      cell('1.1', 1, 1),
    ]),
    table(1, 5, [
      ...dictionaryHeaders,
      cell('WRITE (v), WRITES, WROTE, WRITTEN', 1, 0),
      cell('To record information', 1, 1),
      cell('WRITE THE VALUE.', 1, 2),
      cell('', 1, 3),
      cell('wrap (v)', 2, 0),
      cell('PUT (v)', 2, 1),
      cell('PUT THE PART IN PAPER.', 2, 2),
      cell('Wrap the part in paper.', 2, 3),
      cell('', 3, 0),
      cell('WIND (v)', 3, 1),
      cell('WIND THREE- PHASE TAPE.', 3, 2),
      cell('Wrap the tape.', 3, 3),
    ]),
    table(2, 6, [
      cell('Word (part of speech)', 0, 0),
      cell('Approved meaning/ ALTERNATIVES', 0, 1, 3),
      cell('STE EXAMPLE', 0, 3),
      cell('Non-STE example', 0, 4),
      cell('whose (pron)', 1, 0),
      cell('Use a different construction.', 1, 2),
      cell('USE TWO SENTENCES.', 1, 3),
      cell('Use a clause whose meaning is unclear.', 1, 4),
    ]),
  ];
  return {
    schema_name: 'DoclingDocument',
    version: 'test',
    name: 'synthetic-ste',
    origin: { filename: 'synthetic.pdf', mimetype: 'application/pdf' },
    pages: Object.fromEntries(Array.from({ length: 6 }, (_, index) => [String(index + 1), {}])),
    texts,
    tables,
    pictures: [],
    groups: [{
      self_ref: '#/groups/0',
      label: 'key_value_area',
      children: [{ $ref: '#/texts/0' }, { $ref: '#/tables/0' }],
    }],
    body: {
      children: [
        { $ref: '#/groups/0' },
        ...texts.slice(1, 12).map(({ self_ref }) => ({ $ref: self_ref })),
        { $ref: '#/texts/12' },
        { $ref: '#/tables/1' },
        { $ref: '#/texts/13' },
        { $ref: '#/tables/2' },
      ],
    },
  };
}
