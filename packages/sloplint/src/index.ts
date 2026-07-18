import { Linter, resolveConfig, type Lint, type Parser } from 'writinglint-core';
import { OnnxParser } from 'writinglint-parser-node/onnx';
import { extractInput, inputKind, type InputKind } from './extract.js';
import { ensureModel, type ModelOptions } from './model.js';
import { profileFor, type ProfileName } from './profiles.js';

export type MinimumLevel = 'info' | 'warning' | 'error';

export interface SloplintOptions extends ModelOptions {
  /** Supply a parser in tests or alternate hosts. The default is the local ONNX parser. */
  parser?: Parser;
}

export interface LintSourceOptions {
  /** Minimum confidence-derived level to return. */
  level?: MinimumLevel;
}

export interface SloplintResult {
  kind: InputKind;
  lints: Lint[];
}

const profileForLevel = (level: MinimumLevel): ProfileName =>
  level === 'info' ? 'strict' : level === 'error' ? 'ci' : 'recommended';

/**
 * In-process Sloplint API for editor extensions and other local integrations.
 * A single instance reuses its parser sessions across documents.
 */
export class Sloplint {
  private readonly linter: Linter;

  constructor(parser: Parser) {
    this.linter = new Linter(parser);
  }

  supports(filePath: string): boolean {
    return inputKind(filePath) !== undefined;
  }

  async lintSource(filePath: string, source: string, options: LintSourceOptions = {}): Promise<SloplintResult | undefined> {
    const kind = inputKind(filePath);
    if (!kind) return undefined;
    const extracted = extractInput(filePath, source);
    const profile = profileForLevel(options.level ?? 'warning');
    const config = resolveConfig(profileFor(kind, profile));
    const { lints } = await this.linter.lint(extracted.text, config);
    return {
      kind,
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

/** Load Sloplint's local parser and return a reusable in-process linter. */
export async function createSloplint(options: SloplintOptions = {}): Promise<Sloplint> {
  if (options.parser) return new Sloplint(options.parser);
  const modelDir = await ensureModel(options);
  const parser = await OnnxParser.load({ modelDir });
  return new Sloplint(parser);
}

export { DEFAULT_EXTENSIONS, extractInput, extractLintText, inputKind } from './extract.js';
export type { ExtractedInput, InputKind } from './extract.js';
export type { ModelOptions } from './model.js';
