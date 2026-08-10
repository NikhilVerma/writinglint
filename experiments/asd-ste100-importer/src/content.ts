import { normalizeExtractedText, tableToMatrix } from './tables.js';
import type { ContentBlock, OrderedNode } from './types.js';

const EXCLUDED_TEXT_LABELS = new Set(['page_header', 'page_footer']);

export function contentBlock(node: OrderedNode): ContentBlock | undefined {
  if (node.kind === 'picture') {
    return { kind: 'picture', source: node.source, label: node.label };
  }
  if (node.kind === 'table') {
    return { kind: 'table', source: node.source, rows: tableToMatrix(node) };
  }
  if (EXCLUDED_TEXT_LABELS.has(node.label)) return undefined;
  const normalized = normalizeExtractedText(node.text);
  const kind = node.label === 'section_header'
    ? 'heading'
    : node.label === 'list_item'
      ? 'list-item'
      : node.label === 'code'
        ? 'code'
        : node.label === 'caption'
          ? 'caption'
          : node.label === 'footnote'
            ? 'footnote'
            : node.label === 'text'
              ? 'paragraph'
              : 'text';
  return {
    kind,
    source: node.source,
    label: node.label,
    ...normalized,
  };
}

export function contentBlocks(nodes: readonly OrderedNode[]): ContentBlock[] {
  return nodes.map(contentBlock).filter((block): block is ContentBlock => block !== undefined);
}
