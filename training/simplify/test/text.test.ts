import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeOutput, proseRatio, repetitionRatio, stripEmoji } from '../src/lib/text.ts';

test('removes plain and astral emoji with surrounding spacing intact', () => {
  assert.equal(stripEmoji('Never 🚫 do this'), 'Never do this');
  assert.equal(stripEmoji('- 🚫 Never hardcode secrets'), '- Never hardcode secrets');
  assert.equal(stripEmoji('water 💧.'), 'water.');
});

test('removes ZWJ sequences and variation selectors as one unit', () => {
  assert.equal(stripEmoji('dev 👩‍💻 life'), 'dev life');
  assert.equal(stripEmoji('warning ⚠️ ahead'), 'warning ahead');
});

test('preserves nested-list indentation and non-emoji text', () => {
  const doc = '- top 🚀 item\n  - nested item\n\nPlain paragraph.';
  assert.equal(stripEmoji(doc), '- top item\n  - nested item\n\nPlain paragraph.');
});

test('proseRatio drops for code dumps but holds for prose with some code', () => {
  const codeDump = '```js\nconst a = 1;\nconst b = 2;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nOne line.\n';
  const prose = 'A full paragraph explaining the change in plain words.\n\n`inline()` reference.\n';
  assert.ok(proseRatio(codeDump) < 0.4);
  assert.ok(proseRatio(prose) > 0.8);
});

test('repetitionRatio flags degenerate loops, not normal prose', () => {
  const loop = 'the modern professional is not a marathon '.repeat(30);
  const normal = 'Each sentence in this paragraph says something different about the topic at hand, moving from setup to detail to conclusion without repeating any earlier phrasing at all.';
  assert.ok(repetitionRatio(loop) > 0.3);
  assert.ok(repetitionRatio(normal) < 0.1);
});

test('a reasoning block is dropped before the rewrite is scored', () => {
  const raw = '<think>The reader needs shorter sentences here.</think>\n\nThe API went offline at 14:02.';
  assert.equal(normalizeOutput(raw), 'The API went offline at 14:02.');
});

test('a rewrite that never escaped the reasoning block scores as empty', () => {
  assert.equal(normalizeOutput('<think>Let me consider the opening paragraph'), '');
});
