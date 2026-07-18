/** Browser-only Sloplint engine backed by the bundled, owned INT8 ONNX parser. */
import * as ort from 'onnxruntime-web';
import { decodeTree, Linter, resolveConfig } from 'writinglint-core';
import type { Parser, ParsedSentence } from 'writinglint-core';
import { encodeWordPieces, splitSentences, tokenizeWords, type SentenceTokens } from 'writinglint-parser-node/tokenizer';
import { strict } from 'writinglint-rulepack-ai-style';

interface Manifest { upos: string[]; relations: string[] }
interface TokenizerFile { model: { vocab: Record<string, number> } }

const int64 = (values: readonly number[], dimensions: readonly number[]) =>
  new ort.Tensor('int64', BigInt64Array.from(values, BigInt), dimensions);

const index3 = (row: number, item: number, width: number, items: number) =>
  (row * items + item) * width;

function argmax(values: Float32Array, start: number, count: number): number {
  let best = 0;
  for (let index = 1; index < count; index++) if (values[start + index]! > values[start + best]!) best = index;
  return best;
}

class ExtensionOnnxParser implements Parser {
  constructor(
    private readonly parser: ort.InferenceSession,
    private readonly relations: ort.InferenceSession,
    private readonly manifest: Manifest,
    private readonly vocab: Record<string, number>,
  ) {}

  async parse(text: string): Promise<ParsedSentence[]> {
    const sentences = splitSentences(text).map(tokenizeWords).filter((sentence) => sentence.words.length);
    if (!sentences.length) return [];
    const encoded = sentences.map((sentence) => encodeWordPieces(sentence.words, this.vocab));
    if (encoded.some((item) => item.inputIds.length > 256)) throw new Error('A sentence exceeds 256 subwords.');
    const batch = sentences.length;
    const maxSubwords = Math.max(...encoded.map((item) => item.inputIds.length));
    const maxWords = Math.max(...encoded.map((item) => item.wordStarts.length));
    const inputIds = new Array<number>(batch * maxSubwords).fill(0);
    const attention = new Array<number>(batch * maxSubwords).fill(0);
    const starts = new Array<number>(batch * maxWords).fill(0);
    const masks = new Uint8Array(batch * maxWords);
    encoded.forEach((item, row) => {
      item.inputIds.forEach((id, column) => {
        inputIds[row * maxSubwords + column] = id;
        attention[row * maxSubwords + column] = 1;
      });
      item.wordStarts.forEach((value, column) => {
        starts[row * maxWords + column] = value;
        masks[row * maxWords + column] = 1;
      });
    });
    const output = await this.parser.run({
      input_ids: int64(inputIds, [batch, maxSubwords]),
      attention_mask: int64(attention, [batch, maxSubwords]),
      word_starts: int64(starts, [batch, maxWords]),
      word_mask: new ort.Tensor('bool', masks, [batch, maxWords]),
    });
    const arcs = output.arc_logits!.data as Float32Array;
    const heads = new Array<number>(batch * maxWords).fill(0);
    sentences.forEach((sentence, row) => {
      const count = sentence.words.length;
      const scores = Array.from({ length: count }, (_, dependent) => Array.from(
        { length: count + 1 },
        (_, head) => arcs[index3(row, dependent, maxWords + 1, maxWords) + head]!,
      ));
      decodeTree(scores).forEach((head, dependent) => { heads[row * maxWords + dependent] = head; });
    });
    const relationOutput = await this.relations.run({
      relation_dependent: output.relation_dependent!,
      relation_heads: output.relation_heads!,
      selected_heads: int64(heads, [batch, maxWords]),
    });
    return sentences.map((sentence, row) => this.build(
      sentence,
      row,
      maxWords,
      heads,
      output.upos_logits!.data as Float32Array,
      relationOutput.relation_logits!.data as Float32Array,
    ));
  }

  private build(
    sentence: SentenceTokens,
    row: number,
    maxWords: number,
    heads: number[],
    upos: Float32Array,
    relations: Float32Array,
  ): ParsedSentence {
    const uposWidth = this.manifest.upos.length;
    const relationWidth = this.manifest.relations.length;
    return {
      text: sentence.text,
      start: sentence.start,
      end: sentence.end,
      tokens: sentence.words.map((word, index) => ({
        id: index + 1,
        form: word.form,
        lemma: word.form.toLowerCase(),
        upos: this.manifest.upos[argmax(upos, index3(row, index, uposWidth, maxWords), uposWidth)]!,
        head: heads[row * maxWords + index]!,
        deprel: this.manifest.relations[argmax(relations, index3(row, index, relationWidth, maxWords), relationWidth)]!,
        start: word.start,
        end: word.end,
      })),
    };
  }
}

let cached: Promise<Linter> | undefined;

export function loadLinter(): Promise<Linter> {
  return (cached ??= (async () => {
    const resource = (path: string) => chrome.runtime.getURL(path);
    ort.env.wasm.wasmPaths = {
      wasm: resource('ort/ort-wasm-simd-threaded.wasm'),
      mjs: resource('ort/ort-wasm-simd-threaded.mjs'),
    };
    ort.env.wasm.numThreads = 1;
    const [manifestResponse, tokenizerResponse, parserBytes, relationBytes] = await Promise.all([
      fetch(resource('model/manifest.json')),
      fetch(resource('model/tokenizer/tokenizer.json')),
      fetch(resource('model/parser.onnx')).then((response) => response.arrayBuffer()),
      fetch(resource('model/relations.onnx')).then((response) => response.arrayBuffer()),
    ]);
    if (!manifestResponse.ok || !tokenizerResponse.ok) throw new Error('Bundled Sloplint model is incomplete.');
    const [parser, relations] = await Promise.all([
      ort.InferenceSession.create(parserBytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }),
      ort.InferenceSession.create(relationBytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }),
    ]);
    const manifest = await manifestResponse.json() as Manifest;
    const tokenizer = await tokenizerResponse.json() as TokenizerFile;
    return new Linter(new ExtensionOnnxParser(parser, relations, manifest, tokenizer.model.vocab));
  })());
}

export const strictConfig = resolveConfig(strict);
