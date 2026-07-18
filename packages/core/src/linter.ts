/**
 * The engine. `Linter.lint(text, config)` parses the text once, instantiates the
 * enabled rules, visits the document a single time dispatching to each rule's
 * listener, then returns the collected, deduped, sorted lints.
 */
import { buildDocument, type Document } from './document.js';
import type { Parser } from './parser.js';
import { resolveConfig, type Config, type ResolvedConfig, type ResolvedRule } from './config.js';
import type { Category } from './pack.js';
import type { ActiveSeverity, Confidence, Lint, ReportDescriptor, RuleContext } from './rule.js';
import { spanOf } from './graph.js';

export interface LintReport {
  doc: Document;
  lints: Lint[];
  /** Category metadata for the rules that ran (for grouping / colour in a UI). */
  categories: Record<string, Category>;
}

/** `{{key}}` interpolation for messageId templates. */
function interpolate(template: string, data?: Record<string, string | number>): string {
  if (!data) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in data ? String(data[k]) : m));
}

function isResolved(config: Config | ResolvedConfig): config is ResolvedConfig {
  return config.rules instanceof Map;
}

export class Linter {
  constructor(private readonly parser: Parser) {}

  async lint(text: string, config: Config | ResolvedConfig): Promise<LintReport> {
    const resolved = isResolved(config) ? config : resolveConfig(config);
    const doc = await buildDocument(text, this.parser);
    const lints: Lint[] = [];

    // Instantiate one listener per enabled rule, each with its own report().
    const listeners = [...resolved.rules.values()].map((rr) => ({
      rule: rr,
      listener: rr.rule.create(makeContext(rr, doc, lints)),
    }));

    // Single walk: Document once, then every Sentence, then every Token.
    for (const { listener } of listeners) listener.Document?.(doc);
    for (const p of doc.paragraphs) for (const { listener } of listeners) listener.Paragraph?.(p);
    for (const s of doc.sentences) for (const { listener } of listeners) listener.Sentence?.(s);
    for (const t of doc.tokens) for (const { listener } of listeners) listener.Token?.(t);
    for (const { listener } of listeners) listener.DocumentExit?.(doc);

    return {
      doc,
      lints: dedupe(lints)
        .filter((lint) => severityRank(lint.severity) >= severityRank(resolved.minimumSeverity))
        .sort((a, b) => a.start - b.start || b.end - a.end),
      categories: resolved.categories,
    };
  }
}

/** Build the report()-bearing context handed to a rule's create(). */
function makeContext(rr: ResolvedRule, doc: Document, sink: Lint[]): RuleContext {
  return {
    ruleId: rr.ruleId,
    category: rr.category,
    options: rr.options,
    doc,
    get findings() { return sink; },
    report(d: ReportDescriptor): void {
      let start: number;
      let end: number;
      if (d.span) {
        ({ start, end } = d.span);
      } else if (d.tokens && d.sentence) {
        ({ start, end } = spanOf(d.sentence, d.tokens));
      } else {
        throw new Error(`${rr.ruleId}: report() needs either 'span' or 'tokens' + 'sentence'`);
      }
      const template = d.message ?? rr.rule.meta.messages?.[d.messageId ?? ''] ?? d.messageId ?? '';
      const confidence = d.confidence ?? rr.rule.meta.defaultConfidence ?? 'medium';
      sink.push({
        ruleId: rr.ruleId,
        category: rr.category,
        severity: rr.severity === 'auto' ? severityFor(confidence) : rr.severity,
        confidence,
        start,
        end,
        text: doc.text.slice(start, end),
        message: interpolate(template, d.data),
        fix: d.fix,
        suggestion: d.suggestion,
      });
    },
  };
}

const severityRank = (severity: ActiveSeverity): number => ({ info: 0, warn: 1, error: 2 })[severity];
const severityFor = (confidence: Confidence): ActiveSeverity => ({ low: 'info', medium: 'warn', high: 'error' })[confidence] as ActiveSeverity;

/** Drop exact-duplicate spans from the same rule (rules can double-hit). */
function dedupe(lints: Lint[]): Lint[] {
  const seen = new Set<string>();
  const out: Lint[] = [];
  for (const l of lints) {
    const key = `${l.ruleId}:${l.start}:${l.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

// ── rendering: flatten overlapping lints into non-overlapping segments ────────

/** A non-overlapping slice of text: either plain, or owned by one lint. */
export interface Segment {
  start: number;
  end: number;
  lint?: Lint;
}

/**
 * Flatten possibly-overlapping lints into non-overlapping segments, so a UI can
 * wrap each in exactly one span/mark. When lints contend for a character, the
 * one with the LOWER `priority(lint)` number wins (ties keep the first seen).
 * Default priority is 0 for all — pass a priority (e.g. from a pack's category
 * order) to make overlaps deterministic.
 */
export function segments(text: string, lints: Lint[], priority?: (lint: Lint) => number): Segment[] {
  if (lints.length === 0) return [{ start: 0, end: text.length }];
  const prio = priority ?? (() => 0);

  const owner: (Lint | undefined)[] = new Array(text.length);
  for (const l of lints) {
    const p = prio(l);
    for (let i = l.start; i < l.end && i < text.length; i++) {
      const cur = owner[i];
      if (!cur || prio(cur) > p) owner[i] = l;
    }
  }

  const out: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const l = owner[i];
    let j = i + 1;
    while (j < text.length && owner[j] === l) j++;
    out.push(l ? { start: i, end: j, lint: l } : { start: i, end: j });
    i = j;
  }
  return out;
}
