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

test('a think block that opens after the answer does not eat the answer', () => {
  // lastIndexOf threw away everything before the LAST closing tag, so a model
  // that answered and then second-guessed itself scored a silent degenerate
  // zero. Where the block opens is what decides which side the rewrite is on.
  const trailing = 'The API run records 4146 pass and 0 fail.<think>Should I have kept the bold?</think>';
  assert.equal(normalizeOutput(trailing), 'The API run records 4146 pass and 0 fail.');

  // A leading block still goes, with or without the opening tag the chat
  // template may have supplied already.
  assert.equal(normalizeOutput('<think>weighing it up</think>The rewrite.'), 'The rewrite.');
  assert.equal(normalizeOutput('weighing it up</think>The rewrite.'), 'The rewrite.');

  // And thinking on both sides leaves the rewrite in the middle.
  assert.equal(normalizeOutput('<think>first</think>The rewrite.<think>second</think>'), 'The rewrite.');
});
