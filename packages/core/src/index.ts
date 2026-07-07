/**
 * @writinglint/core — the grammar-linter engine.
 *
 * A Document model over a real dependency-parse + POS graph, an authorable Rule
 * API, config resolution, and the Linter. Knows nothing about any particular
 * rulepack; the AI-writing rules live in @writinglint/rulepack-ai-style.
 */

// Document model + parser surface
export { buildDocument } from './document.js';
export type { Document, Sentence, Tok } from './document.js';
export type { Parser } from './parser.js';

// Dependency-graph model + helpers (the toolkit rule authors match with)
export {
  byteToChar,
  makeSentence,
  childrenOf,
  root,
  byId,
  child,
  childrenByRel,
  hasChild,
  subtree,
  spanOf,
  isGerund,
  lower,
} from './graph.js';
export type { DepSentence } from './graph.js';
export type { DepToken, ParsedSentence } from 'nlpgraph';

// Authoring a rule
export { defineRule } from './rule.js';
export type {
  Rule,
  RuleContext,
  RuleListener,
  RuleMeta,
  ReportDescriptor,
  Lint,
  TextFix,
  Severity,
  ActiveSeverity,
} from './rule.js';

// Authoring a rulepack
export { definePack } from './pack.js';
export type { Rulepack, Category } from './pack.js';

// Config
export { defineConfig, resolveConfig } from './config.js';
export type { Config, RuleSetting, ResolvedConfig, ResolvedRule } from './config.js';

// The engine
export { Linter, segments } from './linter.js';
export type { LintReport, Segment } from './linter.js';
