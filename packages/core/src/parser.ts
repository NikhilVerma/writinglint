/**
 * The parser surface the engine depends on. Implementations live in
 * environment-specific packages so the engine itself stays platform-agnostic.
 */
import type { ParsedSentence } from './parse-types.js';

export interface Parser {
  parse(text: string): Promise<ParsedSentence[]>;
}
