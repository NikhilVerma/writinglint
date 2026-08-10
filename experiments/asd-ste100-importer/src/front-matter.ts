import { contentBlocks } from './content.js';
import { tableToMatrix } from './tables.js';
import type { ContentBlock, OrderedNode, SubjectIndexEntry } from './types.js';

export function parseFrontMatter(
  nodes: readonly OrderedNode[],
  partOneIndex: number,
): { blocks: ContentBlock[]; subjectIndex: SubjectIndexEntry[] } {
  const frontMatterNodes = nodes.slice(0, partOneIndex);
  const subjectIndex: SubjectIndexEntry[] = [];
  for (const node of frontMatterNodes) {
    if (node.kind !== 'table') continue;
    const rows = tableToMatrix(node);
    if (rows[0]?.[0] !== 'Subject' || rows[0]?.[1] !== 'Rule') continue;
    for (const row of rows.slice(1)) {
      const subject = row[0]?.trim();
      const references = row[1]?.trim();
      if (!subject || !references) continue;
      subjectIndex.push({ subject, references, source: node.source });
    }
  }
  return { blocks: contentBlocks(frontMatterNodes), subjectIndex };
}
