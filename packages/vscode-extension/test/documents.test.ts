import assert from 'node:assert/strict';
import test from 'node:test';
import { lintPath } from '../src/documents.js';

test('keeps filesystem paths intact', () => {
  assert.equal(lintPath('/repo/README.md', 'markdown', false), '/repo/README.md');
});

test('gives supported untitled documents a virtual extension', () => {
  assert.equal(lintPath('Untitled-1', 'markdown', true), 'untitled.md');
  assert.equal(lintPath('Untitled-2', 'typescript', true), 'untitled.ts');
});

test('leaves unknown untitled language modes unsupported', () => {
  assert.equal(lintPath('Untitled-1', 'binary', true), 'Untitled-1');
});
