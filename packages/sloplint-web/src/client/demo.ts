import type { Lint } from 'writinglint-core';

const host = document.querySelector<HTMLElement>('[data-slop-demo]');

if (host) {
  const input = host.querySelector<HTMLTextAreaElement>('textarea')!;
  const run = host.querySelector<HTMLButtonElement>('[data-run]')!;
  const status = host.querySelector<HTMLElement>('[data-status]')!;
  const results = host.querySelector<HTMLElement>('[data-results]')!;
  const totals = host.querySelector<HTMLElement>('[data-totals]')!;
  let worker: Worker | undefined;
  let ready = false;
  let pending = false;
  let request = 0;

  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);

  const lineOf = (text: string, offset: number) => text.slice(0, offset).split('\n').length;

  function render(lints: Lint[]): void {
    const counts = { error: 0, warn: 0, info: 0 };
    for (const lint of lints) counts[lint.severity]++;
    totals.textContent = `${counts.error} errors  ·  ${counts.warn} warnings  ·  ${counts.info} notes`;
    results.innerHTML = lints.length
      ? lints.slice(0, 12).map((lint) => `
        <button class="finding finding--${lint.severity}" type="button" data-start="${lint.start}">
          <span class="finding__level">${lint.severity}</span>
          <span class="finding__message">${escape(lint.message.replaceAll('—', ':'))}</span>
          <span class="finding__meta">${escape(lint.ruleId)} · line ${lineOf(input.value, lint.start)}</span>
        </button>`).join('')
      : '<p class="results-empty">No tells found in this sample.</p>';
    status.textContent = `Linted locally. ${lints.length} finding${lints.length === 1 ? '' : 's'}.`;
    run.disabled = false;
  }

  function lint(): void {
    if (!ready || !worker) { pending = true; return; }
    const id = ++request;
    status.textContent = 'Reading the structure...';
    run.disabled = true;
    worker.postMessage({ type: 'lint', id, text: input.value });
  }

  function start(): void {
    if (worker) { lint(); return; }
    run.disabled = true;
    status.textContent = 'Loading the on-device parser...';
    worker = new Worker('/slop-worker.js', { type: 'module' });
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'progress') {
        const loaded = message.loaded ? `${Math.round(message.loaded / 1_000_000)} MB` : '';
        status.textContent = `${message.stage === 'parser' ? 'Loading parser' : 'Preparing local inference'}${loaded ? ` · ${loaded}` : ''}...`;
      } else if (message.type === 'ready') {
        ready = true;
        run.disabled = false;
        if (pending) { pending = false; lint(); }
      } else if (message.type === 'result' && message.id === request) render(message.lints);
      else if (message.type === 'error') {
        status.textContent = `Could not lint: ${message.message}`;
        run.disabled = false;
      }
    };
    pending = true;
  }

  run.addEventListener('click', start);
  results.addEventListener('click', (event) => {
    const finding = (event.target as HTMLElement).closest<HTMLElement>('[data-start]');
    if (!finding) return;
    const start = Number(finding.dataset.start);
    input.focus();
    input.setSelectionRange(start, start + 1);
  });
}
