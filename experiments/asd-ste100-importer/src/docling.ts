import { readFileSync } from 'node:fs';
import type {
  BoundingBox,
  DoclingDocument,
  DoclingGroupItem,
  DoclingPictureItem,
  DoclingProvenance,
  DoclingReference,
  DoclingTableItem,
  DoclingTextItem,
  OrderedNode,
  SourceLocation,
} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertReferenceArray(value: unknown, name: string): asserts value is DoclingReference[] {
  if (!Array.isArray(value) || value.some((item) => !isRecord(item) || typeof item.$ref !== 'string')) {
    throw new Error(`${name} must be an array of Docling references.`);
  }
}

export function loadDoclingDocument(path: string): DoclingDocument {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(value)) throw new Error('Docling input must contain one JSON object.');
  if (!isRecord(value.body)) throw new Error('Docling input is missing body.');
  assertReferenceArray(value.body.children, 'body.children');
  for (const name of ['texts', 'tables', 'pictures', 'groups'] as const) {
    if (!Array.isArray(value[name])) throw new Error(`Docling input is missing ${name}.`);
  }
  return value as unknown as DoclingDocument;
}

function sourceLocation(ref: string, prov?: DoclingProvenance[]): SourceLocation {
  const first = prov?.[0];
  return {
    ref,
    page: typeof first?.page_no === 'number' ? first.page_no : null,
    bbox: first?.bbox ? { ...first.bbox } as BoundingBox : null,
  };
}

interface Resolver {
  texts: Map<string, DoclingTextItem>;
  tables: Map<string, DoclingTableItem>;
  pictures: Map<string, DoclingPictureItem>;
  groups: Map<string, DoclingGroupItem>;
}

function makeResolver(document: DoclingDocument): Resolver {
  const mapByReference = <T extends { self_ref: string }>(items: readonly T[]): Map<string, T> =>
    new Map(items.map((item) => [item.self_ref, item]));
  return {
    texts: mapByReference(document.texts),
    tables: mapByReference(document.tables),
    pictures: mapByReference(document.pictures),
    groups: mapByReference(document.groups),
  };
}

function resolveChildren(
  references: readonly DoclingReference[],
  resolver: Resolver,
  activeGroups: Set<string>,
  output: OrderedNode[],
): void {
  for (const { $ref: ref } of references) {
    const text = resolver.texts.get(ref);
    if (text) {
      output.push({
        kind: 'text',
        ref,
        label: text.label,
        text: text.text,
        source: sourceLocation(ref, text.prov),
      });
      continue;
    }
    const table = resolver.tables.get(ref);
    if (table) {
      output.push({
        kind: 'table',
        ref,
        cells: table.data?.table_cells ?? [],
        source: sourceLocation(ref, table.prov),
      });
      continue;
    }
    const picture = resolver.pictures.get(ref);
    if (picture) {
      output.push({
        kind: 'picture',
        ref,
        label: picture.label ?? 'picture',
        source: sourceLocation(ref, picture.prov),
      });
      continue;
    }
    const group = resolver.groups.get(ref);
    if (group) {
      if (activeGroups.has(ref)) throw new Error(`Docling group cycle at ${ref}.`);
      activeGroups.add(ref);
      resolveChildren(group.children ?? [], resolver, activeGroups, output);
      activeGroups.delete(ref);
      continue;
    }
    throw new Error(`Docling reference does not resolve: ${ref}.`);
  }
}

export function orderedNodes(document: DoclingDocument): OrderedNode[] {
  const output: OrderedNode[] = [];
  resolveChildren(document.body.children, makeResolver(document), new Set(), output);
  return output;
}

export function documentPageCount(document: DoclingDocument): number {
  return document.pages ? Object.keys(document.pages).length : 0;
}
