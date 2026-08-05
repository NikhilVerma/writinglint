import assert from 'node:assert/strict';
import test from 'node:test';
import { bundledModelDirectory, OnnxParser } from '../src/onnx-parser.js';

interface ObservedSession {
  run(feeds: Record<string, { dims: readonly number[] }>): Promise<Record<string, unknown>>;
}

test('ONNX parser chunks an overlength unpunctuated block instead of aborting', async () => {
  const parser = await OnnxParser.load({ modelDir: bundledModelDirectory() });
  const text = Array.from({ length: 320 }, (_, index) => `word${index}`).join(' ');
  const sentences = await parser.parse(text);

  assert.ok(sentences.length > 1);
  assert.equal(sentences[0]?.start, 0);
  assert.equal(sentences.at(-1)?.end, text.length);
  assert.equal(
    sentences.flatMap((sentence) => sentence.tokens).filter((token) => token.form.startsWith('word')).length,
    320,
  );
});

test('ONNX parser bounds the number of sentences in one inference batch', async () => {
  const parser = await OnnxParser.load({
    modelDir: bundledModelDirectory(),
    maxBatchSentences: 2,
  });
  const session = Reflect.get(parser, 'parser') as ObservedSession;
  const originalRun = session.run.bind(session);
  const batchSizes: number[] = [];
  session.run = async (feeds) => {
    batchSizes.push(feeds.input_ids!.dims[0]!);
    return originalRun(feeds);
  };

  const text = Array.from(
    { length: 7 },
    (_, index) => `Sentence ${index} explains one small and concrete parser behavior.`,
  ).join(' ');
  const sentences = await parser.parse(text);

  assert.deepEqual(batchSizes, [2, 2, 2, 1]);
  assert.equal(sentences.length, 7);
  assert.deepEqual(sentences.map(({ text: sentence }) => sentence), text.match(/[^.]+\./g)?.map((sentence) => sentence.trim()));
});

test('bounded inference preserves the same dependency parse as one large batch', async () => {
  const modelDir = bundledModelDirectory();
  const bounded = await OnnxParser.load({ modelDir, maxBatchSentences: 2 });
  const unbounded = await OnnxParser.load({ modelDir, maxBatchSentences: 100 });
  const text = [
    'The writer explains the first result carefully.',
    'A reviewer checks the supporting evidence.',
    'The final paragraph states the narrower conclusion.',
  ].join(' ');

  assert.deepEqual(await bounded.parse(text), await unbounded.parse(text));
});

test('ONNX parser rejects invalid inference batch limits', async () => {
  await assert.rejects(
    OnnxParser.load({ modelDir: bundledModelDirectory(), maxBatchSentences: 0 }),
    /maxBatchSentences must be a positive integer/,
  );
});
