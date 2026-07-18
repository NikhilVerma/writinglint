import { segments, type Lint } from 'writinglint-core';
import { CATEGORY_ORDER } from 'writinglint-rulepack-ai-style';

const host = document.querySelector<HTMLElement>('[data-slop-demo]');

if (host) {
  const demo = host;
  const input = demo.querySelector<HTMLTextAreaElement>('textarea')!;
  const backdrop = demo.querySelector<HTMLElement>('[data-backdrop]')!;
  const status = demo.querySelector<HTMLElement>('[data-status]')!;
  const results = demo.querySelector<HTMLElement>('[data-results]')!;
  const totals = demo.querySelector<HTMLElement>('[data-totals]')!;
  const count = demo.querySelector<HTMLElement>('[data-count]')!;
  const loading = demo.querySelector<HTMLElement>('[data-loading]')!;
  const loadingLabel = demo.querySelector<HTMLElement>('[data-loading-label]')!;
  const loadingBar = demo.querySelector<HTMLElement>('[data-loading-bar]')!;

  const severityRank = { error: 0, warn: 1, info: 2 } as const;
  const categoryRank = new Map(CATEGORY_ORDER.map((category, index) => [category, index]));
  const priorityOf = (lint: Lint) => severityRank[lint.severity] * 100 + (categoryRank.get(lint.category) ?? 99);
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);

  let worker: Worker | undefined;
  let ready = false;
  let inFlight = false;
  let pending = false;
  let request = 0;
  let sentText = input.value;
  let editTimer = 0;
  let firstResult = true;

  function lineColOf(text: string, offset: number): { line: number; column: number } {
    let line = 1;
    let column = 1;
    for (let index = 0; index < offset && index < text.length; index++) {
      if (text[index] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
    return { line, column };
  }

  function paint(text: string, lints: Lint[]): void {
    backdrop.innerHTML = segments(text, lints, priorityOf).map((segment) => {
      const value = escape(text.slice(segment.start, segment.end));
      if (!segment.lint) return value;
      const index = lints.indexOf(segment.lint);
      return `<mark class="editor-tell editor-tell--${segment.lint.severity}" data-lint-index="${index}">${value}</mark>`;
    }).join('') + '\n';
  }

  function render(lints: Lint[]): void {
    const counts = { error: 0, warn: 0, info: 0 };
    for (const lint of lints) counts[lint.severity]++;
    count.textContent = String(lints.length);
    totals.textContent = `${counts.error} errors · ${counts.warn} warnings · ${counts.info} notes`;

    const ordered = lints
      .map((lint, index) => ({ lint, index }))
      .sort((a, b) => a.lint.start - b.lint.start || severityRank[a.lint.severity] - severityRank[b.lint.severity]);

    results.innerHTML = ordered.length
      ? ordered.map(({ lint, index }) => {
        const location = lineColOf(sentText, lint.start);
        const excerpt = lint.text.replace(/\s+/g, ' ').trim();
        return `
          <button class="finding finding--${lint.severity}" type="button"
            data-lint-index="${index}" data-start="${lint.start}" data-end="${lint.end}"
            title="Select “${escape(excerpt)}” in the draft">
            <span class="finding__level">${lint.severity === 'info' ? 'note' : lint.severity}</span>
            <span class="finding__content">
              <span class="finding__message">${escape(lint.message)}</span>
              <span class="finding__excerpt">“${escape(excerpt)}”</span>
              <span class="finding__meta">${escape(lint.ruleId)} · ${location.line}:${location.column}</span>
            </span>
          </button>`;
      }).join('')
      : '<p class="results-empty"><strong>No tells found.</strong><br />This draft reads clean to the active rules.</p>';

    paint(sentText, lints);
    status.textContent = `${lints.length} finding${lints.length === 1 ? '' : 's'} · updated just now`;
    if (firstResult) {
      firstResult = false;
      backdrop.classList.add('is-drawn');
    }
  }

  function clear(): void {
    request++;
    sentText = input.value;
    paint(input.value, []);
    render([]);
    status.textContent = 'Type something to start sifting.';
  }

  function lint(): void {
    if (!ready || !worker) {
      pending = true;
      return;
    }
    if (!input.value.trim()) {
      clear();
      return;
    }
    if (inFlight) {
      pending = true;
      return;
    }
    inFlight = true;
    const id = ++request;
    sentText = input.value;
    status.textContent = 'Reading the sentence structure…';
    demo.classList.add('is-linting');
    worker.postMessage({ type: 'lint', id, text: sentText });
  }

  function settle(): void {
    inFlight = false;
    if (pending) {
      pending = false;
      lint();
    } else {
      demo.classList.remove('is-linting');
    }
  }

  function start(): void {
    worker = new Worker('/slop-worker.js', { type: 'module' });
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'progress') {
        const loaded = message.loaded ?? 0;
        const total = message.total ?? 0;
        const size = loaded ? `${Math.round(loaded / 1_000_000)} MB` : '';
        loadingLabel.textContent = `${message.stage === 'parser' ? 'Loading parser' : 'Preparing local inference'}${size ? ` · ${size}` : ''}`;
        if (total > 0) loadingBar.style.transform = `scaleX(${Math.min(1, loaded / total)})`;
      } else if (message.type === 'ready') {
        ready = true;
        loadingBar.style.transform = 'scaleX(1)';
        loading.classList.add('is-done');
        lint();
      } else if (message.type === 'result') {
        if (message.id === request && input.value === sentText) {
          render(message.lints);
        }
        settle();
      } else if (message.type === 'error') {
        loadingLabel.textContent = `Could not start the parser: ${message.message}`;
        loading.classList.remove('is-done');
        loading.classList.add('is-error');
        status.textContent = 'The local parser could not start.';
        settle();
      }
    };
    worker.onerror = (event) => {
      loadingLabel.textContent = `Worker error: ${event.message}`;
      loading.classList.add('is-error');
      status.textContent = 'The local parser could not start.';
      settle();
    };
  }

  input.addEventListener('input', () => {
    paint(input.value, []);
    window.clearTimeout(editTimer);
    if (!input.value.trim()) {
      clear();
      return;
    }
    status.textContent = ready ? 'Waiting for a pause…' : 'The parser will sift this when it is ready.';
    editTimer = window.setTimeout(lint, 320);
  });

  input.addEventListener('scroll', () => {
    backdrop.scrollTop = input.scrollTop;
    backdrop.scrollLeft = input.scrollLeft;
  });

  const marksFor = (index: number) => backdrop.querySelectorAll<HTMLElement>(`[data-lint-index="${index}"]`);
  results.addEventListener('mouseover', (event) => {
    const finding = (event.target as HTMLElement).closest<HTMLElement>('[data-lint-index]');
    if (!finding) return;
    marksFor(Number(finding.dataset.lintIndex)).forEach((mark) => mark.classList.add('is-active'));
  });
  results.addEventListener('mouseout', (event) => {
    const finding = (event.target as HTMLElement).closest<HTMLElement>('[data-lint-index]');
    if (!finding) return;
    marksFor(Number(finding.dataset.lintIndex)).forEach((mark) => mark.classList.remove('is-active'));
  });
  results.addEventListener('click', (event) => {
    const finding = (event.target as HTMLElement).closest<HTMLElement>('[data-start][data-end]');
    if (!finding) return;
    const start = Number(finding.dataset.start);
    const end = Number(finding.dataset.end);
    const index = Number(finding.dataset.lintIndex);
    const mark = backdrop.querySelector<HTMLElement>(`[data-lint-index="${index}"]`);
    if (mark) {
      input.scrollTop = Math.max(0, mark.offsetTop - input.clientHeight / 2);
      backdrop.scrollTop = input.scrollTop;
      mark.classList.remove('is-pulsing');
      void mark.offsetWidth;
      mark.classList.add('is-pulsing');
    }
    input.focus();
    input.setSelectionRange(start, end);
  });

  paint(input.value, []);
  start();
}
