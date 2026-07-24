import assert from 'node:assert/strict';
import test from 'node:test';
import { bundledModelDirectory, OnnxParser } from '../src/onnx-parser.js';

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
