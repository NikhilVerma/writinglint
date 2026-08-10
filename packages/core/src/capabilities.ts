/** Linguistic information a parser can promise to rule authors. */
export type ParserCapability =
  | 'sentence-boundaries'
  | 'tokens'
  | 'part-of-speech'
  | 'dependencies'
  | 'lemmas'
  | 'morphology'
  | 'confidence';

export type ParserCapabilities = readonly ParserCapability[];

export interface ParserDescriptor {
  /** Stable implementation or model identifier. */
  id: string;
  /** Version of the parser contract implementation or model bundle. */
  version: string;
  /** BCP 47 language tags supported by this parser. */
  languages: readonly string[];
  capabilities: ParserCapabilities;
  /** Optional auditable model fingerprint. */
  modelHash?: string;
}

/** Capabilities guaranteed by the original WritingLint parser contract. */
export const BASE_PARSER_CAPABILITIES: readonly ParserCapability[] = [
  'sentence-boundaries',
  'tokens',
  'part-of-speech',
  'dependencies',
];
