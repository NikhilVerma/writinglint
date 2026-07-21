import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { Lint } from 'writinglint-core';

type Mode = 'markdown' | 'plain';
type Filter = 'all' | Lint['severity'];
type WorkerOutput =
  | { type: 'progress'; stage: string; loaded?: number; total?: number }
  | { type: 'ready' }
  | { type: 'result'; id: number; lints: Lint[]; wordCount: number }
  | { type: 'error'; id?: number; message: string };

interface SavedDraft {
  text: string;
  filename: string;
  mode: Mode;
}

const app = document.querySelector<HTMLElement>('[data-editor-app]');

if (app) {
  const required = <T extends Element>(selector: string): T => {
    const element = app.querySelector<T>(selector);
    if (!element) throw new Error(`Missing editor element: ${selector}`);
    return element;
  };

  const mount = required<HTMLElement>('[data-editor-mount]');
  const fallback = required<HTMLTextAreaElement>('[data-editor-mount] textarea');
  const filenameInput = required<HTMLInputElement>('[data-filename]');
  const modeSelect = required<HTMLSelectElement>('[data-mode]');
  const fileInput = required<HTMLInputElement>('[data-file-input]');
  const documentLabel = required<HTMLElement>('[data-document-label]');
  const parserState = required<HTMLElement>('[data-parser-state]');
  const parserStateLabel = required<HTMLElement>('[data-parser-state] span');
  const status = required<HTMLElement>('[data-status]');
  const saveState = required<HTMLElement>('[data-save-state]');
  const wordCountElement = required<HTMLElement>('[data-word-count]');
  const densityElement = required<HTMLElement>('[data-density]');
  const totalCount = required<HTMLElement>('[data-count]');
  const copyFindings = required<HTMLButtonElement>('[data-copy-findings]');
  const findingsList = required<HTMLElement>('[data-findings]');
  const filterButtons = [...app.querySelectorAll<HTMLButtonElement>('[data-filter]')];
  const countElements = {
    all: required<HTMLElement>('[data-count-all]'),
    error: required<HTMLElement>('[data-count-error]'),
    warn: required<HTMLElement>('[data-count-warn]'),
    info: required<HTMLElement>('[data-count-info]'),
  };
  const sampleNode = document.querySelector<HTMLScriptElement>('#editor-sample');
  const sample = JSON.parse(sampleNode?.textContent || '""') as string;
  const storageKey = 'slopsift.editor.v1';

  const restore = (): SavedDraft | undefined => {
    try {
      const value = localStorage.getItem(storageKey);
      if (!value) return undefined;
      const draft = JSON.parse(value) as Partial<SavedDraft>;
      if (typeof draft.text !== 'string' || typeof draft.filename !== 'string') return undefined;
      return { text: draft.text, filename: draft.filename, mode: draft.mode === 'plain' ? 'plain' : 'markdown' };
    } catch {
      return undefined;
    }
  };

  const restored = restore();
  let filename = restored?.filename ?? filenameInput.value;
  let mode: Mode = restored?.mode ?? 'markdown';
  let activeFilter: Filter = 'all';
  let lastLints: Lint[] = [];
  let lastWordCount = 0;
  let ready = false;
  let inFlight = false;
  let pending = false;
  let requestId = 0;
  let sentText = '';
  let sentPath = '';
  let lintTimer = 0;
  let saveTimer = 0;
  let worker: Worker | undefined;

  filenameInput.value = filename;
  modeSelect.value = mode;
  documentLabel.textContent = filename;

  const language = new Compartment();
  const markdownTheme = HighlightStyle.define([
    { tag: tags.heading1, fontSize: '1.62em', fontWeight: '780', lineHeight: '1.55' },
    { tag: tags.heading2, fontSize: '1.38em', fontWeight: '760', lineHeight: '1.5' },
    { tag: tags.heading3, fontSize: '1.2em', fontWeight: '740', lineHeight: '1.45' },
    { tag: [tags.heading4, tags.heading5, tags.heading6], fontSize: '1.08em', fontWeight: '720' },
    { tag: tags.strong, fontWeight: '780' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: [tags.link, tags.url], color: '#9e211a', textDecoration: 'underline', textUnderlineOffset: '3px' },
    { tag: tags.monospace, fontFamily: 'var(--mono)', color: '#7d3f21' },
    { tag: tags.quote, color: '#686760', fontStyle: 'italic' },
    { tag: tags.list, color: '#9e211a' },
    { tag: tags.contentSeparator, color: '#d93a2f', fontWeight: '700' },
    { tag: tags.meta, color: '#9b978d' },
  ]);

  const editorTheme = EditorView.theme({
    '&': { height: '100%', color: 'var(--ink)', backgroundColor: '#fff' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--display)', lineHeight: '1.66', overflow: 'auto' },
    '.cm-content': { width: '100%', maxWidth: '1120px', minHeight: '100%', margin: '0 auto', padding: '30px 8px 120px' },
    '.cm-line': { padding: '0 32px 0 18px' },
    '.cm-gutters': {
      backgroundColor: '#faf9f5',
      color: '#686760',
      borderRight: '1px solid var(--line)',
      fontFamily: 'var(--mono)',
      fontSize: '10px',
    },
    '.cm-activeLine': { backgroundColor: '#f3f1eb' },
    '.cm-activeLineGutter': { backgroundColor: '#ebe8df', color: 'var(--ink)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: '#f0c9c5 !important' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--red)', borderLeftWidth: '2px' },
    '.cm-searchMatch': { backgroundColor: '#f2dfae', outline: '1px solid #b36b21' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#f0c9c5' },
    '.cm-panels': { backgroundColor: '#e8e5dc', color: 'var(--ink)' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--ink)' },
    '.cm-textfield': { border: '1px solid var(--line)', borderRadius: '0', backgroundColor: '#fff' },
    '.cm-button': { border: '1px solid var(--ink)', borderRadius: '0', background: '#fff' },
    '.cm-tooltip': { border: '1px solid var(--ink)', borderRadius: '0', boxShadow: '6px 6px 0 rgba(217,58,47,.18)' },
    '.cm-tooltip-lint': { fontFamily: 'var(--display)' },
  });

  const modeExtension = () => mode === 'markdown' ? markdown() : [];
  const initialText = restored?.text ?? fallback.value;
  fallback.remove();

  const view = new EditorView({
    parent: mount,
    state: EditorState.create({
      doc: initialText,
      extensions: [
        basicSetup,
        EditorState.tabSize.of(2),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': 'Markdown or plain-text draft',
          'aria-multiline': 'true',
          spellcheck: 'true',
          autocapitalize: 'sentences',
        }),
        editorTheme,
        syntaxHighlighting(markdownTheme),
        language.of(modeExtension()),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          scheduleSave();
          scheduleLint();
        }),
      ],
    }),
  });

  function currentText(): string {
    return view.state.doc.toString();
  }

  function pathForLint(): string {
    if (mode === 'plain') return filename.toLowerCase().endsWith('.txt') ? filename : `${filename}.txt`;
    return /\.(?:md|markdown)$/i.test(filename) ? filename : `${filename}.md`;
  }

  function lineColumn(offset: number): { line: number; column: number } {
    const line = view.state.doc.lineAt(Math.max(0, Math.min(offset, view.state.doc.length)));
    return { line: line.number, column: offset - line.from + 1 };
  }

  function saveDraft(): void {
    window.clearTimeout(saveTimer);
    try {
      localStorage.setItem(storageKey, JSON.stringify({ text: currentText(), filename, mode } satisfies SavedDraft));
      saveState.textContent = 'Saved in this browser';
    } catch {
      saveState.textContent = 'Could not save locally';
    }
  }

  function scheduleSave(): void {
    saveState.textContent = 'Saving locally';
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveDraft, 250);
  }

  function diagnosticsFor(lints: Lint[]): Diagnostic[] {
    return lints.map((lint) => ({
      from: lint.start,
      to: lint.end,
      severity: lint.severity === 'warn' ? 'warning' : lint.severity,
      source: lint.ruleId,
      message: lint.message,
      markClass: `cm-slopsift-${lint.severity}`,
    }));
  }

  function findingButton(lint: Lint): HTMLButtonElement {
    const location = lineColumn(lint.start);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `editor-finding editor-finding--${lint.severity}`;
    button.dataset.start = String(lint.start);
    button.dataset.end = String(lint.end);

    const level = document.createElement('span');
    level.className = 'editor-finding__level';
    level.textContent = lint.severity === 'info' ? 'note' : lint.severity;

    const content = document.createElement('span');
    content.className = 'editor-finding__content';
    const message = document.createElement('strong');
    message.textContent = lint.message;
    const excerpt = document.createElement('span');
    excerpt.className = 'editor-finding__excerpt';
    excerpt.textContent = `“${lint.text.replace(/\s+/g, ' ').trim()}”`;
    const meta = document.createElement('span');
    meta.className = 'editor-finding__meta';
    meta.textContent = `${lint.ruleId}  ${location.line}:${location.column}`;
    content.append(message, excerpt, meta);
    button.append(level, content);
    return button;
  }

  function renderFindings(): void {
    const counts = {
      error: lastLints.filter((lint) => lint.severity === 'error').length,
      warn: lastLints.filter((lint) => lint.severity === 'warn').length,
      info: lastLints.filter((lint) => lint.severity === 'info').length,
    };
    totalCount.textContent = String(lastLints.length);
    countElements.all.textContent = String(lastLints.length);
    countElements.error.textContent = String(counts.error);
    countElements.warn.textContent = String(counts.warn);
    countElements.info.textContent = String(counts.info);
    copyFindings.disabled = lastLints.length === 0;
    wordCountElement.textContent = lastWordCount.toLocaleString();
    densityElement.textContent = lastWordCount ? ((lastLints.length / lastWordCount) * 1000).toFixed(1) : '0';

    const visible = lastLints
      .filter((lint) => activeFilter === 'all' || lint.severity === activeFilter)
      .sort((a, b) => a.start - b.start);
    findingsList.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement('p');
      empty.className = 'findings-placeholder';
      empty.textContent = lastLints.length ? 'No findings at this level.' : 'No tells found in the current draft.';
      findingsList.append(empty);
      return;
    }
    findingsList.append(...visible.map(findingButton));
  }

  function applyResult(lints: Lint[], wordCount: number): void {
    lastLints = lints;
    lastWordCount = wordCount;
    view.dispatch(setDiagnostics(view.state, diagnosticsFor(lints)));
    renderFindings();
    status.textContent = `${lints.length} finding${lints.length === 1 ? '' : 's'} found`;
    parserState.classList.add('is-ready');
    parserState.classList.remove('is-working', 'is-error');
    parserStateLabel.textContent = 'Local parser ready';
  }

  function lintNow(): void {
    window.clearTimeout(lintTimer);
    if (!ready || !worker) {
      pending = true;
      return;
    }
    if (inFlight) {
      pending = true;
      return;
    }
    const text = currentText();
    if (!text.trim()) {
      requestId++;
      lastLints = [];
      lastWordCount = 0;
      view.dispatch(setDiagnostics(view.state, []));
      renderFindings();
      status.textContent = 'Start writing to run SlopSift';
      return;
    }
    inFlight = true;
    sentText = text;
    sentPath = pathForLint();
    const id = ++requestId;
    parserState.classList.add('is-working');
    parserStateLabel.textContent = 'Reading sentence structure';
    status.textContent = 'Linting locally';
    worker.postMessage({ type: 'lint', id, text, path: sentPath });
  }

  function scheduleLint(): void {
    status.textContent = ready ? 'Waiting for a pause' : 'The parser will lint this draft when ready';
    window.clearTimeout(lintTimer);
    lintTimer = window.setTimeout(lintNow, 360);
  }

  function settle(): void {
    inFlight = false;
    if (pending) {
      pending = false;
      lintNow();
    }
  }

  function replaceDocument(text: string): void {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    view.focus();
  }

  function setMode(nextMode: Mode): void {
    mode = nextMode;
    modeSelect.value = mode;
    view.dispatch({ effects: language.reconfigure(modeExtension()) });
    scheduleSave();
    scheduleLint();
  }

  function setFilename(nextFilename: string): void {
    filename = nextFilename.trim() || (mode === 'markdown' ? 'untitled.md' : 'untitled.txt');
    filenameInput.value = filename;
    documentLabel.textContent = filename;
    scheduleSave();
    scheduleLint();
  }

  function startWorker(): void {
    worker = new Worker('/slop-worker.js', { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerOutput>) => {
      const message = event.data;
      if (message.type === 'progress') {
        const size = message.loaded ? ` ${Math.round(message.loaded / 1_000_000)} MB` : '';
        parserStateLabel.textContent = `${message.stage === 'parser' ? 'Loading local parser' : 'Preparing inference'}${size}`;
      } else if (message.type === 'ready') {
        ready = true;
        parserState.classList.add('is-ready');
        parserStateLabel.textContent = 'Local parser ready';
        lintNow();
      } else if (message.type === 'result') {
        if (message.id === requestId && currentText() === sentText && pathForLint() === sentPath) {
          applyResult(message.lints, message.wordCount);
        }
        settle();
      } else if (message.type === 'error') {
        parserState.classList.add('is-error');
        parserState.classList.remove('is-working', 'is-ready');
        parserStateLabel.textContent = 'Parser failed';
        status.textContent = message.message;
        settle();
      }
    };
    worker.onerror = (event) => {
      parserState.classList.add('is-error');
      parserState.classList.remove('is-working', 'is-ready');
      parserStateLabel.textContent = 'Parser failed';
      status.textContent = event.message;
      settle();
    };
  }

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = (button.dataset.filter ?? 'all') as Filter;
      filterButtons.forEach((candidate) => candidate.setAttribute('aria-pressed', String(candidate === button)));
      renderFindings();
    });
  });

  findingsList.addEventListener('click', (event) => {
    const finding = (event.target as HTMLElement).closest<HTMLElement>('[data-start][data-end]');
    if (!finding) return;
    const start = Number(finding.dataset.start);
    const end = Number(finding.dataset.end);
    view.dispatch({
      selection: { anchor: start, head: end },
      effects: EditorView.scrollIntoView(start, { y: 'center' }),
    });
    view.focus();
  });

  filenameInput.addEventListener('change', () => setFilename(filenameInput.value));
  filenameInput.addEventListener('blur', () => setFilename(filenameInput.value));
  modeSelect.addEventListener('change', () => setMode(modeSelect.value === 'plain' ? 'plain' : 'markdown'));

  required<HTMLButtonElement>('[data-new]').addEventListener('click', () => {
    if (currentText().trim() && !window.confirm('Start a new draft? The current version is saved in this browser.')) return;
    setFilename(mode === 'markdown' ? 'untitled.md' : 'untitled.txt');
    replaceDocument('');
  });

  required<HTMLButtonElement>('[data-sample]').addEventListener('click', () => {
    if (currentText().trim() && currentText() !== sample && !window.confirm('Replace this draft with the SlopSift sample?')) return;
    setFilename('sample.md');
    setMode('markdown');
    replaceDocument(sample);
  });

  required<HTMLButtonElement>('[data-open]').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const nextMode: Mode = /\.(?:md|markdown)$/i.test(file.name) ? 'markdown' : 'plain';
    setFilename(file.name);
    setMode(nextMode);
    replaceDocument(await file.text());
    fileInput.value = '';
  });

  required<HTMLButtonElement>('[data-download]').addEventListener('click', () => {
    const safeName = filename.replace(/[\\/:*?"<>|]+/g, '-').trim() || (mode === 'markdown' ? 'untitled.md' : 'untitled.txt');
    const blob = new Blob([currentText()], { type: mode === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  copyFindings.addEventListener('click', async () => {
    if (!lastLints.length) return;
    const messages = lastLints.map((lint) => {
      const start = lineColumn(lint.start);
      const end = lineColumn(lint.end);
      const { severity, ...rest } = lint;
      return {
        ...rest,
        line: start.line,
        column: start.column,
        endLine: end.line,
        endColumn: end.column,
        severity: severity === 'error' ? 2 : severity === 'warn' ? 1 : 0,
        level: severity,
      };
    });
    const output = JSON.stringify({
      filePath: filename,
      messages,
      errorCount: lastLints.filter((lint) => lint.severity === 'error').length,
      warningCount: lastLints.filter((lint) => lint.severity === 'warn').length,
      infoCount: lastLints.filter((lint) => lint.severity === 'info').length,
      wordCount: lastWordCount,
      findingsPerThousandWords: lastWordCount ? Number(((lastLints.length / lastWordCount) * 1000).toFixed(1)) : 0,
    });
    try {
      await navigator.clipboard.writeText(`${output}\n`);
      copyFindings.textContent = 'Copied';
    } catch {
      copyFindings.textContent = 'Copy failed';
    }
    window.setTimeout(() => { copyFindings.textContent = 'Copy JSONL'; }, 1200);
  });

  renderFindings();
  startWorker();
}
