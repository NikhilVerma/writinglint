/**
 * Parser-neutral Universal Dependencies data consumed by WritingLint.
 *
 * Offsets are document-global UTF-16 code-unit indices, matching JavaScript's
 * `String.prototype.slice`. Token ids and heads are 1-based within a sentence;
 * a head of 0 marks the root.
 */
export interface DepToken {
  id: number;
  form: string;
  upos: string;
  head: number;
  deprel: string;
  start: number;
  end: number;
  lemma?: string;
  /** Parser-neutral Universal Dependencies morphological features. */
  features?: Readonly<Record<string, string>>;
  /** Calibrated probabilities when the parser can provide them. */
  confidence?: {
    upos?: number;
    head?: number;
    deprel?: number;
  };
}

export interface ParsedSentence {
  text: string;
  start: number;
  end: number;
  tokens: DepToken[];
}
