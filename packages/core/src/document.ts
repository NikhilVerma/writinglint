/**
 * The Document model — the parse-once artifact every rule reads.
 *
 * Parsers report document-global UTF-16 offsets into the exact text passed to
 * `parse()`, so highlights can be used directly with `text.slice()`.
 */
import type { ParsedSentence } from './parse-types.js';
import { makeSentence, type DepSentence } from './graph.js';
import type { Parser } from './parser.js';
import { BASE_PARSER_CAPABILITIES, type ParserDescriptor } from './capabilities.js';
import type { SpanAnnotation } from './annotations.js';
import { validateRegions, type DocumentRegion } from './structure.js';

/** A word token with GLOBAL char offsets into the original text (lexical rules). */
export interface Tok {
  text: string;
  /** lower-cased text, for matching. */
  lower: string;
  /** Universal POS tag from the parse ('NOUN', 'VERB', 'PUNCT', …). */
  upos: string;
  start: number;
  end: number;
  /** Index of the sentence this token belongs to. */
  sentence: number;
  lemma?: string;
  features?: Readonly<Record<string, string>>;
  confidence?: {
    upos?: number;
    head?: number;
    deprel?: number;
  };
}

/** A sentence: its global char anchor, its dependency graph, and word tokens. */
export interface Sentence {
  text: string;
  start: number;
  end: number;
  /** Position of this sentence in the document. */
  index: number;
  /** Dependency graph for structural rules. */
  dep: DepSentence;
  /** Non-punctuation tokens with global char offsets (for lexical rules). */
  words: Tok[];
}

/** A blank-line-delimited prose block used for cross-sentence evidence. */
export interface Paragraph {
  text: string;
  start: number;
  end: number;
  index: number;
  sentences: Sentence[];
}

/** A parsed document: the text, its sentences, and a flat token stream. */
export interface Document {
  text: string;
  /** Default BCP 47 language tag for the document. */
  language: string;
  sentences: Sentence[];
  /** Blank-line-delimited blocks for paragraph-level rules and aggregation. */
  paragraphs: Paragraph[];
  /** Flat word-token stream across the whole document (lexical convenience). */
  tokens: Tok[];
  /** Extractor-supplied source roles, separate from the linguistic parse. */
  regions: DocumentRegion[];
  /** Parser-independent annotations supplied by recognizers or callers. */
  annotations: SpanAnnotation[];
  /** Parser identity and the capabilities available during this run. */
  parser: ParserDescriptor;
}

export interface BuildDocumentOptions {
  language?: string;
  regions?: readonly DocumentRegion[];
  annotations?: readonly SpanAnnotation[];
}

/** Parse `text` with a loaded parser and assemble the Document. */
export async function buildDocument(
  text: string,
  parser: Parser,
  options: BuildDocumentOptions = {},
): Promise<Document> {
  const parsed = await parser.parse(text);
  const sentences: Sentence[] = [];
  const tokens: Tok[] = [];

  parsed.forEach((ps: ParsedSentence, sIndex: number) => {
    const dep = makeSentence(ps);

    // Sentence source range (doc-global). Fall back to token span if absent.
    const first = ps.tokens[0];
    const last = ps.tokens[ps.tokens.length - 1];
    const start = ps.start ?? first?.start ?? 0;
    const end = ps.end ?? last?.end ?? 0;

    const words: Tok[] = ps.tokens
      .filter((t) => t.upos !== 'PUNCT' && t.upos !== 'SYM')
      .map((t) => ({
        text: t.form,
        lower: t.form.toLowerCase(),
        upos: t.upos,
        start: t.start,
        end: t.end,
        sentence: sIndex,
        lemma: t.lemma,
        features: t.features,
        confidence: t.confidence,
      }));

    tokens.push(...words);
    sentences.push({ text: ps.text, start, end, index: sIndex, dep, words });
  });

  const paragraphs = buildParagraphs(text, sentences);
  const regions = options.regions
    ? [...options.regions]
    : defaultRegions(text, paragraphs);
  validateRegions(text, regions);
  const annotations = [...(options.annotations ?? [])];
  validateAnnotations(text, annotations);
  return {
    text,
    language: options.language ?? parser.descriptor?.languages[0] ?? 'und',
    sentences,
    paragraphs,
    tokens,
    regions,
    annotations,
    parser: parser.descriptor ?? {
      id: 'writinglint/legacy-parser',
      version: 'unknown',
      languages: [options.language ?? 'und'],
      capabilities: BASE_PARSER_CAPABILITIES,
    },
  };
}

function defaultRegions(text: string, paragraphs: readonly Paragraph[]): DocumentRegion[] {
  return [
    { id: 'writinglint:document', role: 'document', start: 0, end: text.length },
    ...paragraphs.map((paragraph) => ({
      id: `writinglint:paragraph:${paragraph.index}`,
      role: 'paragraph' as const,
      start: paragraph.start,
      end: paragraph.end,
      parentId: 'writinglint:document',
    })),
  ];
}

function validateAnnotations(text: string, annotations: readonly SpanAnnotation[]): void {
  for (const annotation of annotations) {
    if (!annotation.kind || !annotation.provider
      || !Number.isInteger(annotation.start) || !Number.isInteger(annotation.end)
      || annotation.start < 0 || annotation.end < annotation.start || annotation.end > text.length) {
      throw new Error(`Annotation ${annotation.kind || '<unknown>'} has an invalid source range or provider.`);
    }
    if (annotation.confidence !== undefined
      && (!Number.isFinite(annotation.confidence) || annotation.confidence < 0 || annotation.confidence > 1)) {
      throw new Error(`Annotation ${annotation.kind} confidence must be between 0 and 1.`);
    }
  }
}

function buildParagraphs(text: string, sentences: Sentence[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const boundaries = [...text.matchAll(/\n[\t ]*\n/g)];
  let segmentStart = 0;
  for (let index = 0; index <= boundaries.length; index++) {
    const segmentEnd = index < boundaries.length ? boundaries[index]!.index : text.length;
    const segment = text.slice(segmentStart, segmentEnd);
    const leading = segment.search(/\S/);
    if (leading !== -1) {
      const trailing = segment.length - segment.trimEnd().length;
      const start = segmentStart + leading;
      const end = segmentEnd - trailing;
      paragraphs.push({
        text: text.slice(start, end),
        start,
        end,
        index: paragraphs.length,
        sentences: sentences.filter((sentence) => sentence.end > start && sentence.start < end),
      });
    }
    const boundary = boundaries[index];
    segmentStart = boundary ? boundary.index + boundary[0].length : text.length;
  }
  return paragraphs;
}
