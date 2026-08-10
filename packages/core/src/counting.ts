import type { Document, Sentence, Tok } from './document.js';
import { annotationsOverlapping, type SpanAnnotation } from './annotations.js';

export interface CountUnit {
  start: number;
  end: number;
  text: string;
  kind: string;
  /** Document-global token starts represented by this unit. */
  tokenStarts: readonly number[];
  annotation?: SpanAnnotation;
}

export interface CountPolicy {
  id: string;
  /** Annotation kinds that count as one unit regardless of their token count. */
  groupAnnotationKinds?: readonly string[];
  /** Annotation kinds whose covered tokens do not count. */
  excludeAnnotationKinds?: readonly string[];
  includeToken?: (token: Tok, sentence: Sentence, doc: Document) => boolean;
  transform?: (units: readonly CountUnit[], sentence: Sentence, doc: Document) => readonly CountUnit[];
}

export const TOKEN_COUNT_POLICY: CountPolicy = { id: 'writinglint/token-count-v1' };

function coveredBy(annotation: SpanAnnotation, token: Tok): boolean {
  return token.end > annotation.start && token.start < annotation.end;
}

export function countSentenceUnits(
  sentence: Sentence,
  doc: Document,
  policy: CountPolicy = TOKEN_COUNT_POLICY,
): CountUnit[] {
  const annotations = annotationsOverlapping(doc.annotations, sentence.start, sentence.end);
  const grouped = annotations.filter(({ kind, start, end }) =>
    policy.groupAnnotationKinds?.includes(kind) && start >= sentence.start && end <= sentence.end);
  const excluded = annotations.filter(({ kind }) => policy.excludeAnnotationKinds?.includes(kind));
  const units: CountUnit[] = [];
  const consumed = new Set<number>();

  for (const annotation of grouped.sort((left, right) => left.start - right.start || right.end - left.end)) {
    const tokens = sentence.words.filter((token) => coveredBy(annotation, token));
    if (!tokens.length || tokens.some((token) => consumed.has(token.start))) continue;
    tokens.forEach((token) => consumed.add(token.start));
    units.push({
      start: annotation.start,
      end: annotation.end,
      text: doc.text.slice(annotation.start, annotation.end),
      kind: annotation.kind,
      tokenStarts: tokens.map((token) => token.start),
      annotation,
    });
  }

  for (const token of sentence.words) {
    if (consumed.has(token.start)
      || excluded.some((annotation) => coveredBy(annotation, token))
      || (policy.includeToken && !policy.includeToken(token, sentence, doc))) continue;
    units.push({
      start: token.start,
      end: token.end,
      text: token.text,
      kind: 'token',
      tokenStarts: [token.start],
    });
  }

  units.sort((left, right) => left.start - right.start || left.end - right.end);
  return [...(policy.transform?.(units, sentence, doc) ?? units)];
}
