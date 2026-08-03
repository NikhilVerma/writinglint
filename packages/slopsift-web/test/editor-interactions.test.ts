import assert from 'node:assert/strict';
import test from 'node:test';
import { EditorState } from '@codemirror/state';
import {
  EDITOR_SELECTION_THEME,
  selectEditorDocument,
} from '../src/client/editor-interactions.js';

test('select all covers the complete editor document from any paragraph', () => {
  let state = EditorState.create({
    doc: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
    selection: { anchor: 21 },
  });

  const handled = selectEditorDocument({
    get state() { return state; },
    dispatch(transaction) { state = transaction.state; },
  });

  assert.equal(handled, true);
  assert.equal(state.selection.main.from, 0);
  assert.equal(state.selection.main.to, state.doc.length);
});

test('selection paint cannot intercept the pointer or hide behind the active line', () => {
  assert.equal(EDITOR_SELECTION_THEME['.cm-selectionLayer'].pointerEvents, 'none');
  assert.equal(EDITOR_SELECTION_THEME['.cm-selectionLayer *'].pointerEvents, 'none');
  assert.equal(EDITOR_SELECTION_THEME['.cm-activeLine'].backgroundColor, 'transparent');
});
