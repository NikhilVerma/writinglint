/** A parser-independent annotation over an exact source span. */
export interface SpanAnnotation<Data = unknown> {
  /** Extensible kind such as `proper-name`, `measurement`, or `term`. */
  kind: string;
  start: number;
  end: number;
  /** Component, model, or dataset that produced the annotation. */
  provider: string;
  confidence?: number;
  data?: Data;
}
export function annotationsOverlapping(
  annotations: readonly SpanAnnotation[],
  start: number,
  end: number,
  kind?: string,
): SpanAnnotation[] {
  return annotations.filter((annotation) =>
    annotation.end > start && annotation.start < end && (!kind || annotation.kind === kind));
}
