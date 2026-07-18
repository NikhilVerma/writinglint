import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWordPieces, splitSentences, tokenizeWords } from '../src/tokenizer.js';

test('owned tokenizer preserves document-global UTF-16 offsets', () => {
  const text = 'First sentence.  Emoji 🧠 works!';
  const sentences = splitSentences(text).map(tokenizeWords);
  assert.deepEqual(sentences.map(({ text: value, start, end }) => ({ value, start, end })), [
    { value: 'First sentence.', start: 0, end: 15 },
    { value: 'Emoji 🧠 works!', start: 17, end: 32 },
  ]);
  assert.deepEqual(sentences[1]!.words.map(({ form, start, end }) => ({ form, start, end })), [
    { form: 'Emoji', start: 17, end: 22 },
    { form: '🧠', start: 23, end: 25 },
    { form: 'works', start: 26, end: 31 },
    { form: '!', start: 31, end: 32 },
  ]);
});

test('owned tokenizer applies English UD contraction boundaries', () => {
  const [sentence] = splitSentences("It can't work and cannot scale.").map(tokenizeWords);
  assert.deepEqual(sentence!.words.map((word) => word.form),
    ['It', 'ca', "n't", 'work', 'and', 'can', 'not', 'scale', '.']);
});

test('WordPiece lookup ignores inherited object properties', () => {
  const vocab = {
    '[CLS]': 1,
    '[SEP]': 2,
    '[UNK]': 3,
    construct: 4,
    '##or': 5,
  };
  const encoded = encodeWordPieces(
    [{ form: 'Constructor', start: 0, end: 11 }],
    vocab,
  );

  assert.deepEqual(encoded.inputIds, [1, 4, 5, 2]);
  assert.deepEqual(encoded.wordStarts, [1]);
});
