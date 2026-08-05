import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ort from 'onnxruntime-node';
import { decodeTree, type Parser, type ParsedSentence } from 'writinglint-core';
import { chunkForEncoder, encodeWordPieces, splitSentences, tokenizeWords, type SentenceTokens } from './tokenizer.js';

interface Manifest {
  upos: string[];
  relations: string[];
}

interface TokenizerFile {
  model: { vocab: Record<string, number> };
}

export interface OnnxParserOptions {
  modelDir: string;
  intraOpNumThreads?: number;
  /** Maximum sentence chunks sent through ONNX in one call. Defaults to 16. */
  maxBatchSentences?: number;
}

const DEFAULT_MAX_BATCH_SENTENCES = 16;

/** Absolute path of the compact model shipped inside the npm package. */
export function bundledModelDirectory(): string {
  return fileURLToPath(new URL('../model', import.meta.url));
}

function int64(values: readonly number[], dimensions: readonly number[]): ort.Tensor {
  return new ort.Tensor('int64', BigInt64Array.from(values, BigInt), dimensions);
}

function index3(row: number, item: number, width: number, items: number): number {
  return (row * items + item) * width;
}

function argmax(values: Float32Array, start: number, count: number): number {
  let best = 0;
  for (let index = 1; index < count; index++) {
    if (values[start + index]! > values[start + best]!) best = index;
  }
  return best;
}

export class OnnxParser implements Parser {
  private constructor(
    private readonly parser: ort.InferenceSession,
    private readonly relations: ort.InferenceSession,
    private readonly manifest: Manifest,
    private readonly vocab: Record<string, number>,
    private readonly maxBatchSentences: number,
  ) {}

  static async load(options: OnnxParserOptions): Promise<OnnxParser> {
    const maxBatchSentences = options.maxBatchSentences ?? DEFAULT_MAX_BATCH_SENTENCES;
    if (!Number.isInteger(maxBatchSentences) || maxBatchSentences < 1) {
      throw new Error('maxBatchSentences must be a positive integer');
    }
    const [manifestText, tokenizerText] = await Promise.all([
      readFile(join(options.modelDir, 'manifest.json'), 'utf8'),
      readFile(join(options.modelDir, 'tokenizer', 'tokenizer.json'), 'utf8'),
    ]);
    const sessionOptions: ort.InferenceSession.SessionOptions = {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    };
    if (options.intraOpNumThreads !== undefined) sessionOptions.intraOpNumThreads = options.intraOpNumThreads;
    const [parser, relations] = await Promise.all([
      ort.InferenceSession.create(join(options.modelDir, 'parser.onnx'), sessionOptions),
      ort.InferenceSession.create(join(options.modelDir, 'relations.onnx'), sessionOptions),
    ]);
    return new OnnxParser(
      parser, relations, JSON.parse(manifestText) as Manifest,
      (JSON.parse(tokenizerText) as TokenizerFile).model.vocab,
      maxBatchSentences,
    );
  }

  async parse(text: string): Promise<ParsedSentence[]> {
    const sentences = splitSentences(text)
      .map(tokenizeWords)
      .filter((sentence) => sentence.words.length > 0)
      .flatMap((sentence) => chunkForEncoder(sentence, this.vocab));
    if (sentences.length === 0) return [];
    const parsed: ParsedSentence[] = [];
    for (let start = 0; start < sentences.length; start += this.maxBatchSentences) {
      parsed.push(...await this.parseBatch(sentences.slice(start, start + this.maxBatchSentences)));
    }
    return parsed;
  }

  private async parseBatch(sentences: SentenceTokens[]): Promise<ParsedSentence[]> {
    const encoded = sentences.map((sentence) => encodeWordPieces(sentence.words, this.vocab));
    const batch = sentences.length;
    const maxSubwords = Math.max(...encoded.map((item) => item.inputIds.length));
    const maxWords = Math.max(...encoded.map((item) => item.wordStarts.length));
    const inputIds = new Array<number>(batch * maxSubwords).fill(0);
    const attentionMask = new Array<number>(batch * maxSubwords).fill(0);
    const wordStarts = new Array<number>(batch * maxWords).fill(0);
    const wordMask = new Uint8Array(batch * maxWords);
    for (let row = 0; row < batch; row++) {
      const item = encoded[row]!;
      item.inputIds.forEach((id, column) => { inputIds[row * maxSubwords + column] = id; attentionMask[row * maxSubwords + column] = 1; });
      item.wordStarts.forEach((start, column) => { wordStarts[row * maxWords + column] = start; wordMask[row * maxWords + column] = 1; });
    }
    const parserFeeds = {
      input_ids: int64(inputIds, [batch, maxSubwords]),
      attention_mask: int64(attentionMask, [batch, maxSubwords]),
      word_starts: int64(wordStarts, [batch, maxWords]),
      word_mask: new ort.Tensor('bool', wordMask, [batch, maxWords]),
    };
    let output: Awaited<ReturnType<ort.InferenceSession['run']>> | undefined;
    let relationOutput: Awaited<ReturnType<ort.InferenceSession['run']>> | undefined;
    let selectedHeadsTensor: ort.Tensor | undefined;
    try {
      output = await this.parser.run(parserFeeds);
      const arc = output.arc_logits!.data as Float32Array;
      const headWidth = maxWords + 1;
      const selectedHeads = new Array<number>(batch * maxWords).fill(0);
      for (let row = 0; row < batch; row++) {
        const count = sentences[row]!.words.length;
        const scores = Array.from({ length: count }, (_, dependent) =>
          Array.from({ length: count + 1 }, (_, head) => arc[index3(row, dependent, headWidth, maxWords) + head]!));
        decodeTree(scores).forEach((head, dependent) => { selectedHeads[row * maxWords + dependent] = head; });
      }
      selectedHeadsTensor = int64(selectedHeads, [batch, maxWords]);
      relationOutput = await this.relations.run({
        relation_dependent: output.relation_dependent!,
        relation_heads: output.relation_heads!,
        selected_heads: selectedHeadsTensor,
      });
      return sentences.map((sentence, row) => this.buildSentence(
        sentence, row, maxWords, selectedHeads,
        output!.upos_logits!.data as Float32Array,
        relationOutput!.relation_logits!.data as Float32Array,
      ));
    } finally {
      const tensors = new Set<ort.Tensor>([
        ...Object.values(parserFeeds),
        ...Object.values(output ?? {}),
        ...Object.values(relationOutput ?? {}),
        ...(selectedHeadsTensor ? [selectedHeadsTensor] : []),
      ]);
      for (const tensor of tensors) tensor.dispose();
    }
  }

  private buildSentence(
    sentence: SentenceTokens, row: number, maxWords: number, heads: number[],
    upos: Float32Array, relations: Float32Array,
  ): ParsedSentence {
    const uposWidth = this.manifest.upos.length;
    const relationWidth = this.manifest.relations.length;
    return {
      text: sentence.text, start: sentence.start, end: sentence.end,
      tokens: sentence.words.map((word, index) => ({
        id: index + 1, form: word.form, lemma: word.form.toLowerCase(),
        upos: this.manifest.upos[argmax(upos, index3(row, index, uposWidth, maxWords), uposWidth)]!,
        head: heads[row * maxWords + index]!,
        deprel: this.manifest.relations[argmax(relations, index3(row, index, relationWidth, maxWords), relationWidth)]!,
        start: word.start, end: word.end,
      })),
    };
  }
}
