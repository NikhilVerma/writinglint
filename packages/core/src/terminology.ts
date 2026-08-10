export type TerminologyStatus = 'approved' | 'unapproved' | 'technical' | 'unknown';
export type TerminologyLayer = 'language' | 'standard' | 'industry' | 'organization' | 'project' | 'document';

export interface TerminologyProvenance {
  source: string;
  reference?: string;
  page?: number | null;
  version?: string;
  fingerprint?: string;
}

export interface TerminologyRecord {
  id: string;
  term: string;
  status: TerminologyStatus;
  language: string;
  surfaces?: readonly string[];
  partsOfSpeech?: readonly string[];
  meanings?: readonly string[];
  alternatives?: readonly string[];
  provenance: TerminologyProvenance;
}

export interface TerminologyLookup {
  language?: string;
  partOfSpeech?: string;
}

export interface TerminologyMatch {
  providerId: string;
  layer: TerminologyLayer;
  record: TerminologyRecord;
}

export interface TerminologyProviderDescriptor {
  id: string;
  layer: TerminologyLayer;
  languages: readonly string[];
  version?: string;
  fingerprint?: string;
}

/** Synchronous by design because rule listeners run during one deterministic walk. */
export interface TerminologyProvider {
  readonly descriptor: TerminologyProviderDescriptor;
  lookup(surface: string, options?: TerminologyLookup): readonly TerminologyMatch[];
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

export class InMemoryTerminologyProvider implements TerminologyProvider {
  readonly descriptor: TerminologyProviderDescriptor;
  private readonly entries = new Map<string, TerminologyRecord[]>();

  constructor(descriptor: TerminologyProviderDescriptor, records: readonly TerminologyRecord[]) {
    this.descriptor = descriptor;
    for (const record of records) {
      for (const surface of [record.term, ...(record.surfaces ?? [])]) {
        const key = normalized(surface);
        const values = this.entries.get(key) ?? [];
        if (!values.includes(record)) values.push(record);
        this.entries.set(key, values);
      }
    }
  }

  lookup(surface: string, options: TerminologyLookup = {}): readonly TerminologyMatch[] {
    return (this.entries.get(normalized(surface)) ?? [])
      .filter((record) => !options.language || record.language === options.language)
      .filter((record) => !options.partOfSpeech || record.partsOfSpeech?.includes(options.partOfSpeech))
      .map((record) => ({ providerId: this.descriptor.id, layer: this.descriptor.layer, record }));
  }
}

/**
 * Compose providers from lowest to highest precedence. The highest layer with
 * a match wins, so a project or document glossary can override a standard.
 */
export class LayeredTerminologyProvider implements TerminologyProvider {
  readonly descriptor: TerminologyProviderDescriptor;

  constructor(private readonly providers: readonly TerminologyProvider[], id = 'layered-terminology') {
    this.descriptor = {
      id,
      layer: providers.at(-1)?.descriptor.layer ?? 'language',
      languages: [...new Set(providers.flatMap(({ descriptor }) => descriptor.languages))],
    };
  }

  lookup(surface: string, options: TerminologyLookup = {}): readonly TerminologyMatch[] {
    for (let index = this.providers.length - 1; index >= 0; index -= 1) {
      const matches = this.providers[index]!.lookup(surface, options);
      if (matches.length) return matches;
    }
    return [];
  }
}
