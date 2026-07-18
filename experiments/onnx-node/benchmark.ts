import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { OnnxParser } from '../../packages/parser-node/src/index.js';
import type { ParsedSentence } from 'writinglint-core';

interface Reference { text: string; predicted: ParsedSentence }

const modelDir = resolve(process.argv[2] ?? 'models/rule-family-50-onnx');
const referencePath = resolve(process.argv[3] ?? '/tmp/tree-decoder/50.jsonl');
const references = (await readFile(referencePath, 'utf8')).trim().split('\n')
  .map((line) => JSON.parse(line) as Reference);
const rssBefore = process.memoryUsage().rss;
const loadStarted = performance.now();
const parser = await OnnxParser.load({ modelDir });
const loadMs = performance.now() - loadStarted;
const rssAfterLoad = process.memoryUsage().rss;

const timings: number[] = [];
let exactSentences = 0;
let exactTokens = 0;
let tokens = 0;
const mismatches: Array<{ text: string; expected: unknown; actual: unknown }> = [];
for (const reference of references) {
  const started = performance.now();
  const output = await parser.parse(reference.text);
  timings.push(performance.now() - started);
  const actual = output[0];
  const expected = reference.predicted;
  const fields = (sentence: ParsedSentence | undefined) => sentence?.tokens.map(
    ({ form, upos, head, deprel, start, end }) => ({ form, upos, head, deprel, start, end }),
  );
  const expectedFields = fields(expected);
  const actualFields = fields(actual);
  if (JSON.stringify(expectedFields) === JSON.stringify(actualFields)) exactSentences++;
  else if (mismatches.length < 5) mismatches.push({ text: reference.text, expected: expectedFields, actual: actualFields });
  for (let index = 0; index < expected.tokens.length; index++) {
    tokens++;
    if (JSON.stringify(expectedFields?.[index]) === JSON.stringify(actualFields?.[index])) exactTokens++;
  }
}

const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;
};

const document = references.slice(0, 100).map((record) => record.text).join('\n');
for (let index = 0; index < 5; index++) await parser.parse(document);
const documentTimings: number[] = [];
for (let index = 0; index < 20; index++) {
  const started = performance.now();
  await parser.parse(document);
  documentTimings.push(performance.now() - started);
}
const documentTokens = references.slice(0, 100).reduce((sum, record) => sum + record.predicted.tokens.length, 0);

console.log(JSON.stringify({
  machine: { platform: process.platform, architecture: process.arch, node: process.version },
  modelDir,
  sessionLoadMs: loadMs,
  rssBeforeMiB: rssBefore / 2 ** 20,
  rssAfterLoadMiB: rssAfterLoad / 2 ** 20,
  rssDeltaMiB: (rssAfterLoad - rssBefore) / 2 ** 20,
  parity: {
    sentences: references.length, tokens, exactSentences, exactTokens,
    exactSentenceRate: exactSentences / references.length,
    exactTokenRate: exactTokens / tokens,
    mismatches,
  },
  sequentialSingleSentenceMs: {
    mean: timings.reduce((sum, value) => sum + value, 0) / timings.length,
    p50: percentile(timings, 0.5), p95: percentile(timings, 0.95), max: Math.max(...timings),
  },
  batchedHundredSentenceDocument: {
    sentences: 100, tokens: documentTokens,
    meanMs: documentTimings.reduce((sum, value) => sum + value, 0) / documentTimings.length,
    p50Ms: percentile(documentTimings, 0.5), p95Ms: percentile(documentTimings, 0.95),
    tokensPerSecond: documentTokens / ((documentTimings.reduce((sum, value) => sum + value, 0) / documentTimings.length) / 1000),
  },
}, null, 2));
