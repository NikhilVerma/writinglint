/**
 * The authorable Rule API — the reason this project is a linter and not a fixed
 * detector. A rule is a small TS object: `meta` describing it, and `create(ctx)`
 * returning a listener whose callbacks the engine visits in one walk of the
 * document. Rules call `ctx.report(...)` to flag a span.
 *
 * The distinguishing capability vs every other prose linter: a rule's listener
 * receives the dependency GRAPH of each sentence (`sentence.dep`), so it can
 * match on head/child/`deprel` shapes — not just linear token/POS sequences.
 */
import type { DepToken } from 'nlpgraph';
import type { DepSentence } from './graph.js';
import type { Document, Sentence, Tok } from './document.js';

export type Severity = 'off' | 'warn' | 'error';
export type ActiveSeverity = Exclude<Severity, 'off'>;

/** A concrete text replacement a fixer could apply. */
export interface TextFix {
  /** [start, end) char range in the document to replace. */
  range: [number, number];
  /** Replacement text. */
  text: string;
}

/** A single reported problem — the linter's output unit (was `Finding`). */
export interface Lint {
  /** Namespaced identifier, e.g. 'ai-style/corrective-antithesis'. */
  ruleId: string;
  /** The rule's category (pack-defined), for grouping / colour. */
  category: string;
  severity: ActiveSeverity;
  /** Char offset into the original text (inclusive). */
  start: number;
  /** Char offset into the original text (exclusive). */
  end: number;
  /** The exact flagged substring. */
  text: string;
  /** Why it was flagged, in plain language. */
  message: string;
  fix?: TextFix;
  /** Optional concrete suggestion (prose). */
  suggestion?: string;
}

/**
 * What a rule passes to `ctx.report`. Give a location as either an explicit
 * `span` or a set of `tokens` (with the `sentence` they belong to, so the engine
 * can resolve their byte offsets to a global char span). Give the message as a
 * literal `message`, or a `messageId` into `meta.messages` with `data` for
 * `{{placeholder}}` interpolation.
 */
export interface ReportDescriptor {
  span?: { start: number; end: number };
  tokens?: DepToken[];
  sentence?: DepSentence;
  messageId?: string;
  message?: string;
  data?: Record<string, string | number>;
  fix?: TextFix;
  suggestion?: string;
}

/** Everything a rule sees while running, plus how it reports. */
export interface RuleContext<Options = unknown> {
  readonly ruleId: string;
  readonly category: string;
  readonly options: Options;
  readonly doc: Document;
  report(descriptor: ReportDescriptor): void;
}

/**
 * The callbacks a rule subscribes to. The engine visits `Document` once, then
 * every `Sentence` (with its dependency graph), then every `Token`.
 */
export interface RuleListener {
  Document?(doc: Document): void;
  Sentence?(sentence: Sentence): void;
  Token?(token: Tok): void;
}

export interface RuleMeta {
  /** Short name, unique within its rulepack (e.g. 'corrective-antithesis'). */
  name: string;
  /** Category id this rule belongs to (defined by the rulepack). */
  category: string;
  docs: { description: string; url?: string };
  /** messageId → template string, `{{key}}` interpolated from report `data`. */
  messages?: Record<string, string>;
  /** Severity applied when the rule is turned on without an explicit level. */
  defaultSeverity?: ActiveSeverity;
  /** Present if the rule can emit an autofix. */
  fixable?: 'text';
}

export interface Rule<Options = unknown> {
  meta: RuleMeta;
  create(context: RuleContext<Options>): RuleListener;
}

/** Identity helper for authoring — gives inference and a stable call site. */
export function defineRule<Options = unknown>(rule: Rule<Options>): Rule<Options> {
  return rule;
}
