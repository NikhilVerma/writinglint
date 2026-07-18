/** Node adapter for the local persistent Stanza parser process. */
import { existsSync } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Parser, ParsedSentence } from 'writinglint-core';
export { OnnxParser, type OnnxParserOptions } from './onnx-parser.js';
import { OnnxParser } from './onnx-parser.js';

export interface StanzaParserOptions {
  /** Directory containing Stanza's downloaded language models. */
  modelDir?: string;
  /** Python executable containing the `stanza` package. */
  pythonExecutable?: string;
  /** Override the bundled JSON-lines bridge (primarily for development). */
  serverScript?: string;
}

export interface ParserOptions extends StanzaParserOptions {
  /** Prefer the owned ONNX parser, Stanza, or automatically use ONNX when present. */
  backend?: 'auto' | 'onnx' | 'stanza';
  /** Directory containing parser.onnx, relations.onnx, manifest, and tokenizer. */
  onnxModelDir?: string;
}

interface Response {
  id?: number;
  ready?: boolean;
  sentences?: ParsedSentence[];
  error?: string;
}

interface Pending {
  resolve: (sentences: ParsedSentence[]) => void;
  reject: (error: Error) => void;
}

class StanzaParser implements Parser {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly ready: Promise<void>;
  private stderr = '';

  constructor(private readonly process: ChildProcessWithoutNullStreams) {
    this.ready = new Promise<void>((resolve, reject) => {
      const lines = createInterface({ input: process.stdout });
      lines.on('line', (line) => {
        let response: Response;
        try {
          response = JSON.parse(line) as Response;
        } catch {
          reject(new Error(`Stanza emitted invalid JSON: ${line}`));
          return;
        }

        if (response.ready) {
          resolve();
          return;
        }
        if (response.id === undefined) return;
        const pending = this.pending.get(response.id);
        if (!pending) return;
        this.pending.delete(response.id);
        if (response.error) pending.reject(new Error(response.error));
        else pending.resolve(response.sentences ?? []);
      });

      process.stderr.on('data', (chunk: Buffer) => {
        this.stderr = (this.stderr + chunk.toString()).slice(-16_384);
      });
      process.once('error', reject);
      process.once('exit', (code, signal) => {
        const detail = this.stderr.trim();
        const error = new Error(
          `Stanza parser stopped (${signal ?? `exit ${code ?? 'unknown'}`})${detail ? `:\n${detail}` : ''}`,
        );
        reject(error);
        for (const request of this.pending.values()) request.reject(error);
        this.pending.clear();
      });
    });
  }

  async parse(text: string): Promise<ParsedSentence[]> {
    await this.ready;
    const id = this.nextId++;
    return new Promise<ParsedSentence[]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process.stdin.write(`${JSON.stringify({ id, text })}\n`, (error) => {
        if (!error) return;
        this.pending.delete(id);
        reject(error);
      });
    });
  }
}

let cached: Promise<Parser> | undefined;

function defaultPaths(): { modelDir: string; pythonExecutable: string; serverScript: string } {
  return {
    modelDir: fileURLToPath(new URL('../../../experiments/stanza/.models', import.meta.url)),
    pythonExecutable: fileURLToPath(new URL('../../../experiments/stanza/.venv/bin/python', import.meta.url)),
    serverScript: fileURLToPath(new URL('../python/stanza_server.py', import.meta.url)),
  };
}

/** Load and memoise the owned ONNX parser, with Stanza as an explicit fallback. */
export function loadParser(options: ParserOptions = {}): Promise<Parser> {
  if (cached) return cached;
  cached = (async () => {
    const defaults = defaultPaths();
    const onnxModelDir = options.onnxModelDir ?? process.env.WRITINGLINT_ONNX_MODEL ??
      fileURLToPath(new URL('../../../models/rule-family-50-onnx', import.meta.url));
    const backend = options.backend ?? 'auto';
    if (backend === 'onnx' || (backend === 'auto' && existsSync(join(onnxModelDir, 'parser.onnx')))) {
      return OnnxParser.load({ modelDir: onnxModelDir });
    }
    const modelDir = options.modelDir ?? process.env.STANZA_MODEL_DIR ?? defaults.modelDir;
    const pythonExecutable =
      options.pythonExecutable ?? process.env.WRITINGLINT_PYTHON ?? defaults.pythonExecutable;
    const serverScript = options.serverScript ?? defaults.serverScript;

    if (!existsSync(modelDir)) throw new Error(`Stanza model directory not found: ${modelDir}`);
    if (!existsSync(pythonExecutable)) throw new Error(`WritingLint Python not found: ${pythonExecutable}`);
    if (!existsSync(serverScript)) throw new Error(`Stanza bridge not found: ${serverScript}`);

    const child = spawn(pythonExecutable, [serverScript, '--model-dir', modelDir], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parser = new StanzaParser(child);
    // Force startup errors to surface from loadParser(), not the first lint.
    await parser.parse('');
    return parser;
  })();
  return cached;
}
