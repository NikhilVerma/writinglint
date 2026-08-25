export const DOCUMENT_REGION_ROLES = [
  'document',
  'heading',
  'paragraph',
  'section',
  'list',
  'list-item',
  'procedure',
  'step',
  'note',
  'warning',
  'caution',
  'table',
  'table-cell',
  'quotation',
  'caption',
  'disclosure',
  'label',
  'code',
  'metadata',
] as const;

export type DocumentRegionRole = (typeof DOCUMENT_REGION_ROLES)[number] | (string & {});

/** Source structure supplied by an extractor, separate from linguistic parsing. */
export interface DocumentRegion<Metadata = unknown> {
  id: string;
  role: DocumentRegionRole;
  start: number;
  end: number;
  parentId?: string;
  /** BCP 47 language tag when this region differs from the document default. */
  language?: string;
  /** Extensible writing mode such as `descriptive` or `procedural`. */
  mode?: string;
  metadata?: Metadata;
}
export function regionsOverlapping(
  regions: readonly DocumentRegion[],
  start: number,
  end: number,
  role?: DocumentRegionRole,
): DocumentRegion[] {
  return regions.filter((region) =>
    region.end > start && region.start < end && (!role || region.role === role));
}

export function validateRegions(text: string, regions: readonly DocumentRegion[]): void {
  const ids = new Set<string>();
  for (const region of regions) {
    if (!region.id || ids.has(region.id)) throw new Error(`Document region ID is missing or duplicated: ${region.id}.`);
    ids.add(region.id);
    if (!Number.isInteger(region.start) || !Number.isInteger(region.end)
      || region.start < 0 || region.end < region.start || region.end > text.length) {
      throw new Error(`Document region ${region.id} has an invalid UTF-16 source range.`);
    }
  }
  for (const region of regions) {
    if (region.parentId && !ids.has(region.parentId)) {
      throw new Error(`Document region ${region.id} refers to missing parent ${region.parentId}.`);
    }
  }
}
