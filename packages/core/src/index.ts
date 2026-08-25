/**
 * writinglint-core — the grammar-linter engine.
 *
 * A Document model over a real dependency-parse + POS graph, an authorable Rule
 * API, config resolution, and the Linter. Knows nothing about any particular
 * rulepack; the AI-writing rules live in writinglint-rulepack-ai-style.
 */

// Document model + parser surface
export { buildDocument } from './document.js';
export type { BuildDocumentOptions, Document, Paragraph, Sentence, Tok } from './document.js';
export type { Parser } from './parser.js';
export { BASE_PARSER_CAPABILITIES } from './capabilities.js';
export type { ParserCapabilities, ParserCapability, ParserDescriptor } from './capabilities.js';
export { annotationsOverlapping } from './annotations.js';
export type { SpanAnnotation } from './annotations.js';
export { DOCUMENT_REGION_ROLES, regionsOverlapping, validateRegions } from './structure.js';
export type { DocumentRegion, DocumentRegionRole } from './structure.js';
export {
  InMemoryTerminologyProvider,
  LayeredTerminologyProvider,
} from './terminology.js';
export type {
  TerminologyLayer,
  TerminologyLookup,
  TerminologyMatch,
  TerminologyProvider,
  TerminologyProviderDescriptor,
  TerminologyProvenance,
  TerminologyRecord,
  TerminologyStatus,
} from './terminology.js';
export { countSentenceUnits, TOKEN_COUNT_POLICY } from './counting.js';
export type { CountPolicy, CountUnit } from './counting.js';

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
export type { DepToken, ParsedSentence } from './parse-types.js';
export { decodeTree, isValidTree } from './decode.js';

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
  Confidence,
  LintAnchor,
  LintMagnitude,
  MagnitudeMetric,
  RuleEvidence,
  RuleRequirements,
  RuleServices,
} from './rule.js';

// Authoring a rulepack
export { definePack } from './pack.js';
export type { Rulepack, Category } from './pack.js';

// Config
export { defineConfig, resolveConfig } from './config.js';
export type { Config, RuleLevel, RuleSetting, ResolvedConfig, ResolvedRule } from './config.js';

// The engine
export { Linter, segments } from './linter.js';
export type { LintOptions, LintReport, RuleExecution, Segment } from './linter.js';
