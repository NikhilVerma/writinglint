/**
 * The parser surface the engine depends on. Implementations live in
 * environment-specific packages so the engine itself stays platform-agnostic.
 */
import type { ParsedSentence } from './parse-types.js';
import type { ParserDescriptor } from './capabilities.js';

export interface Parser {
  /** Optional capabilities and provenance; legacy parsers receive base capabilities. */
  readonly descriptor?: ParserDescriptor;
  parse(text: string): Promise<ParsedSentence[]>;
}
