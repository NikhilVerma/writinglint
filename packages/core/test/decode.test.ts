import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeTree, isValidTree, makeSentence, subtree, type ParsedSentence } from '../src/index.js';

test('dependency decoder preserves an already valid constrained greedy tree', () => {
  assert.deepEqual(decodeTree([
    [9, -Infinity, 1, 0],
    [0, 8, -Infinity, 1],
    [0, 1, 8, -Infinity],
  ]), [0, 1, 2]);
});

test('dependency decoder repairs a cycle by its lowest-loss rooted edge', () => {
  assert.deepEqual(decodeTree([
    [10, -Infinity, 0, 0],
    [0, 0, -Infinity, 9],
    [0, 8, 10, -Infinity],
  ]), [0, 3, 1]);
});

test('dependency decoder always returns one acyclic root on randomized scores', () => {
  let state = 13;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let size = 1; size < 40; size++) {
    for (let sample = 0; sample < 25; sample++) {
      const scores = Array.from({ length: size }, (_, row) =>
        Array.from({ length: size + 1 }, (_, column) => column === row + 1 ? -Infinity : random() * 20 - 10));
      assert.equal(isValidTree(decodeTree(scores)), true);
    }
  }
});

test('dependency decoder rejects malformed matrices', () => {
  assert.throws(() => decodeTree([[1], [2]]), /N by N\+1/);
});

test('subtree traversal terminates defensively on malformed cyclic input', () => {
  const sentence = makeSentence({
    text: 'one two', start: 0, end: 7,
    tokens: [
      { id: 1, form: 'one', lemma: 'one', upos: 'NOUN', head: 2, deprel: 'dep', start: 0, end: 3 },
      { id: 2, form: 'two', lemma: 'two', upos: 'NOUN', head: 1, deprel: 'dep', start: 4, end: 7 },
    ],
  } as ParsedSentence);
  assert.deepEqual(subtree(sentence, 1).map((token) => token.id), [1, 2]);
});
