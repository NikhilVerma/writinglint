/**
 * The parser surface the engine depends on. nlpgraph's Node and browser
 * `NlpGraph` both satisfy this; loaders live in environment-specific packages
 * (`writinglint-parser-node`, the web app's browser loader) so the engine
 * itself stays platform-agnostic.
 */
import type { ParsedSentence } from 'nlpgraph';

export interface Parser {
  parse(text: string): Promise<ParsedSentence[]>;
}
