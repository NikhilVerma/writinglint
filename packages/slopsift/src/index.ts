import { Linter, resolveConfig, type Lint, type Parser } from 'writinglint-core';
import { OnnxParser } from 'writinglint-parser-node/onnx';
import { extractInput, inputKind, type InputKind } from './extract.js';
import { ensureModel, type ModelOptions } from './model.js';
import {
  profileFor,
  type ProfileName,
  type RulepackName,
  type TechnicalEnglishMode,
} from './profiles.js';
import { countWords } from './format.js';
import { ASD_STE100_ISSUE_9_COVERAGE } from 'writinglint-rulepack-technical-english';

export type MinimumLevel = 'info' | 'warning' | 'error';

export interface SlopSiftOptions extends ModelOptions {
  /** Supply a parser in tests or alternate hosts. The default is the local ONNX parser. */
  parser?: Parser;
}

export interface LintSourceOptions {
  /** Minimum confidence-derived level to return. */
  level?: MinimumLevel;
  /** Emit an informational diagnostic when a supported source has no prose. */
  reportEmpty?: boolean;
  /** Rulepacks to run. Defaults to SlopSift's AI-style pack. */
  rulepacks?: readonly RulepackName[];
  /** ASD-STE100 text type. Descriptive text is the default. */
  technicalMode?: TechnicalEnglishMode;
}

export interface StandardAssessment {
  standard: 'ASD-STE100';
  issue: 9;
  publicationDate: '2025-01-15';
  status: 'nonconformant' | 'review-required';
  automatedRuleFindings: number;
  automatedRules: readonly string[];
  reviewRequired: readonly string[];
  disclaimer: string;
}

export interface SlopSiftResult {
  kind: InputKind;
  lints: Lint[];
  /** Words in the extracted prose/comments that were actually analyzed. */
  wordCount: number;
  /** Present when an ASD-STE100 check was requested. */
  standardAssessment?: StandardAssessment;
}

const profileForLevel = (level: MinimumLevel): ProfileName =>
  level === 'info' ? 'strict' : level === 'error' ? 'ci' : 'recommended';

/**
 * In-process SlopSift API for editor extensions and other local integrations.
 * A single instance reuses its parser sessions across documents.
 */
export class SlopSift {
  private readonly linter: Linter;

  constructor(parser: Parser) {
    this.linter = new Linter(parser);
  }

  supports(filePath: string): boolean {
    return inputKind(filePath) !== undefined;
  }

  async lintSource(filePath: string, source: string, options: LintSourceOptions = {}): Promise<SlopSiftResult | undefined> {
    const kind = inputKind(filePath);
    if (!kind) return undefined;
    const extracted = extractInput(filePath, source);
    const wordCount = countWords(extracted.text);
    if (wordCount === 0) {
      return {
        kind,
        wordCount,
        lints: options.reportEmpty ? [{
          ruleId: 'slopsift/no-extractable-prose',
          category: 'diagnostic',
          severity: 'info',
          confidence: 'high',
          start: 0,
          end: 0,
          text: '',
          message: 'No prose was found in this explicitly selected file. SlopSift did not lint its code or unsupported content locations.',
        }] : [],
      };
    }
    const profile = profileForLevel(options.level ?? 'warning');
    const rulepacks: RulepackName[] = [...new Set<RulepackName>(options.rulepacks ?? ['ai-style'])];
    const config = resolveConfig(profileFor(kind, profile, rulepacks, options.technicalMode));
    const { lints } = await this.linter.lint(extracted.text, config);
    const technicalLints = lints.filter((lint) => lint.ruleId.startsWith('technical-english/'));
    return {
      kind,
      wordCount,
      standardAssessment: rulepacks.includes('asd-ste100') ? {
        standard: 'ASD-STE100',
        issue: 9,
        publicationDate: ASD_STE100_ISSUE_9_COVERAGE.publicationDate,
        status: technicalLints.some((lint) => lint.severity === 'error') ? 'nonconformant' : 'review-required',
        automatedRuleFindings: technicalLints.length,
        automatedRules: ASD_STE100_ISSUE_9_COVERAGE.automatedRules,
        reviewRequired: ASD_STE100_ISSUE_9_COVERAGE.reviewRequired,
        disclaimer: ASD_STE100_ISSUE_9_COVERAGE.disclaimer,
      } : undefined,
      lints: lints.map((lint) => {
        const [start, end] = extracted.sourceRange(lint.start, lint.end);
        const fixRange = lint.fix ? extracted.sourceRange(lint.fix.range[0], lint.fix.range[1]) : undefined;
        return {
          ...lint,
          start,
          end,
          text: source.slice(start, end),
          fix: lint.fix ? { ...lint.fix, range: fixRange! } : undefined,
        };
      }),
    };
  }
}

/** Load SlopSift's local parser and return a reusable in-process linter. */
export async function createSlopSift(options: SlopSiftOptions = {}): Promise<SlopSift> {
  if (options.parser) return new SlopSift(options.parser);
  const modelDir = await ensureModel(options);
  const parser = await OnnxParser.load({ modelDir });
  return new SlopSift(parser);
}

export { DEFAULT_EXTENSIONS, extractInput, extractLintText, inputKind } from './extract.js';
export type { ExtractedInput, InputKind } from './extract.js';
export type { ModelOptions } from './model.js';
export type { RulepackName, TechnicalEnglishMode } from './profiles.js';
