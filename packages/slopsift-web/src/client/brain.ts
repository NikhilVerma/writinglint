import type { Lint } from 'writinglint-core';
import { pressureForMoment, pressureStatus, type BrainPressure } from './brain-model.js';
import type { CognitiveMoment } from './worker.js';

type WorkerOutput =
  | { type: 'progress'; stage: string; loaded?: number; total?: number }
  | { type: 'ready' }
  | { type: 'result'; id: number; lints: Lint[]; wordCount: number; cognitiveMoments: CognitiveMoment[] }
  | { type: 'error'; id?: number; message: string };

const app = document.querySelector<HTMLElement>('[data-brain-app]');

if (app) {
  const required = <T extends Element>(selector: string): T => {
    const element = app.querySelector<T>(selector);
    if (!element) throw new Error(`Missing brain element: ${selector}`);
    return element;
  };
  const textarea = required<HTMLTextAreaElement>('[data-brain-input]');
  const analyseButton = required<HTMLButtonElement>('[data-analyse]');
  const sampleButton = required<HTMLButtonElement>('[data-sample]');
  const parserState = required<HTMLElement>('[data-parser-state]');
  const readingPath = required<HTMLElement>('[data-reading-path]');
  const status = required<HTMLElement>('[data-pressure-status]');
  const counter = required<HTMLElement>('[data-sentence-counter]');
  const eventLog = required<HTMLElement>('[data-event-log]');
  const sampleNode = document.querySelector<HTMLScriptElement>('#brain-sample');
  const sample = JSON.parse(sampleNode?.textContent || '""') as string;
  const worker = new Worker('/slop-worker.js', { type: 'module' });
  let requestId = 0;
  let ready = false;
  let pending = false;
  let observer: IntersectionObserver | undefined;
  let moments: CognitiveMoment[] = [];

  function updateBrain(moment: CognitiveMoment, index: number): void {
    const regions = pressureForMoment(moment);
    for (const region of regions) {
      const fill = required<SVGElement>(`[data-region-fill="${region.key}"]`);
      fill.style.setProperty('--pressure', String(region.pressure));
      const row = required<HTMLElement>(`[data-region-row="${region.key}"]`);
      row.querySelector<HTMLElement>('[data-region-value]')!.textContent = `${region.value} / ${region.capacity}`;
      row.querySelector<HTMLElement>('[data-region-meter]')!.style.setProperty('--pressure', String(region.pressure));
      row.dataset.full = String(region.value >= region.capacity);
    }
    const state = pressureStatus(regions);
    status.textContent = state;
    status.dataset.state = state;
    counter.textContent = `${index + 1} / ${moments.length}`;
    const events = describeEvents(moment, regions);
    eventLog.replaceChildren(...events.map((event) => {
      const item = document.createElement('li');
      item.textContent = event;
      return item;
    }));
  }

  function describeEvents(moment: CognitiveMoment, regions: BrainPressure[]): string[] {
    const events: string[] = [];
    if (moment.introducedEntities.length) events.push(`Held: ${moment.introducedEntities.slice(0, 4).join(', ')}`);
    if (moment.newRelationships) events.push(`${moment.newRelationships} new relationship${moment.newRelationships === 1 ? '' : 's'}`);
    if (moment.reactivations) events.push(`${moment.reactivations} dormant thread${moment.reactivations === 1 ? '' : 's'} returned`);
    if (moment.releasedEntities.length || moment.releasedRelationships) events.push(`Released ${moment.releasedEntities.length + moment.releasedRelationships} frame${moment.releasedEntities.length + moment.releasedRelationships === 1 ? '' : 's'}`);
    if (moment.headingBoundaryBefore) events.push('Heading cleared the active buffer');
    if (moment.consolidationCues.length) events.push(`Consolidation cue: ${moment.consolidationCues[0]}`);
    const full = regions.filter((region) => region.value >= region.capacity).map((region) => region.label.toLowerCase());
    if (full.length) events.push(`At capacity: ${full.join(', ')}`);
    return events.length ? events : ['The current context remains light.'];
  }

  function activate(index: number): void {
    const moment = moments[index];
    if (!moment) return;
    for (const card of readingPath.querySelectorAll<HTMLElement>('[data-moment]')) card.dataset.active = String(Number(card.dataset.moment) === index);
    updateBrain(moment, index);
  }

  function render(nextMoments: CognitiveMoment[]): void {
    moments = nextMoments;
    observer?.disconnect();
    readingPath.replaceChildren();
    if (!moments.length) {
      const empty = document.createElement('p');
      empty.className = 'brain-empty';
      empty.textContent = 'No prose sentences were found. Try a plain-text or Markdown article.';
      readingPath.append(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    moments.forEach((moment, index) => {
      const card = document.createElement('article');
      card.className = 'reading-moment';
      card.dataset.moment = String(index);
      card.dataset.active = String(index === 0);
      card.tabIndex = 0;
      const number = document.createElement('span');
      number.className = 'reading-moment__number';
      number.textContent = String(index + 1).padStart(2, '0');
      const text = document.createElement('p');
      text.textContent = moment.text.trim();
      const delta = document.createElement('span');
      delta.className = 'reading-moment__delta';
      delta.textContent = moment.netInflow > 0 ? `+${moment.netInflow} frames` : moment.netInflow < 0 ? `${moment.netInflow} frames` : 'steady';
      card.append(number, text, delta);
      card.addEventListener('click', () => activate(index));
      card.addEventListener('focus', () => activate(index));
      fragment.append(card);
    });
    readingPath.append(fragment);
    observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => Math.abs(a.boundingClientRect.top - innerHeight * 0.38) - Math.abs(b.boundingClientRect.top - innerHeight * 0.38))[0];
      if (visible) activate(Number((visible.target as HTMLElement).dataset.moment));
    }, { rootMargin: '-25% 0px -50% 0px', threshold: 0 });
    for (const card of readingPath.querySelectorAll('[data-moment]')) observer.observe(card);
    activate(0);
    readingPath.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function analyse(): void {
    if (!ready) {
      pending = true;
      return;
    }
    analyseButton.disabled = true;
    parserState.textContent = 'Reading your document';
    worker.postMessage({ type: 'lint', id: ++requestId, text: textarea.value, path: 'brain.md', preset: 'reader-first' });
  }

  worker.addEventListener('message', (event: MessageEvent<WorkerOutput>) => {
    const message = event.data;
    if (message.type === 'progress') parserState.textContent = message.total ? `Loading local parser ${Math.round((message.loaded ?? 0) / message.total * 100)}%` : 'Loading local parser';
    if (message.type === 'ready') {
      ready = true;
      parserState.textContent = 'Local parser ready';
      analyseButton.disabled = false;
      if (pending) analyse();
    }
    if (message.type === 'result' && message.id === requestId) {
      analyseButton.disabled = false;
      parserState.textContent = `${message.wordCount} words modelled locally`;
      render(message.cognitiveMoments);
    }
    if (message.type === 'error') {
      analyseButton.disabled = false;
      parserState.textContent = 'Could not model this document';
      eventLog.replaceChildren(Object.assign(document.createElement('li'), { textContent: message.message }));
    }
  });

  analyseButton.addEventListener('click', analyse);
  sampleButton.addEventListener('click', () => {
    textarea.value = sample;
    analyse();
  });
  textarea.value = sample;
  analyse();
}
