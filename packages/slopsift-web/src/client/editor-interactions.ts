import { selectAll } from '@codemirror/commands';

/** Keep selection paint visual-only so drag selection always reaches the editor. */
export const EDITOR_SELECTION_THEME = {
  '.cm-selectionLayer': { pointerEvents: 'none' },
  '.cm-selectionLayer *': { pointerEvents: 'none' },
  // An opaque active-line fill sits above CodeMirror's selection layer and
  // makes a selected paragraph look unselected. The gutter already marks it.
  '.cm-activeLine': { backgroundColor: 'transparent' },
} as const;

/** Platform-standard Ctrl/Cmd+A, made explicit for the writing surface. */
export const selectEditorDocument = selectAll;
