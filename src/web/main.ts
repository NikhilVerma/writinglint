import './style.css';
import { analyze, segments } from '../detector/analyze.js';
import { CATEGORIES, CATEGORY_ORDER, type Category, type Finding } from '../detector/types.js';
import type { Parser } from '../detector/tokens.js';
import type { Model } from '../detector/classifier.js';
import { loadEngine } from './parser-browser.js';

const EXAMPLE = `In today's world, artificial intelligence stands as a testament to human ingenuity. It's important to note that AI plays a pivotal role in shaping the future, showcasing a rich tapestry of innovation that continues to captivate researchers and industry leaders alike.

Experts argue that this evolving landscape is not only transformative but also profound. Moreover, the technology boasts a diverse array of applications — from healthcare to finance — nestled in the heart of nearly every modern industry. Studies suggest that its impact will only deepen.

Let's delve into the intricate, vibrant, and multifaceted realm of machine learning. Ultimately, it's not just a tool, it's a paradigm shift, underscoring the importance of responsible innovation and leaving an indelible mark on society.`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const input = $<HTMLTextAreaElement>('input');
const backdrop = $<HTMLDivElement>('backdrop');
const highlights = $<HTMLDivElement>('highlights');
const tooltip = $<HTMLDivElement>('tooltip');

const scoreNum = $<HTMLSpanElement>('score-num');
const scoreRing = $<HTMLDivElement>('score-ring');
const verdictEl = $<HTMLDivElement>('verdict');
const statWords = $<HTMLElement>('stat-words');
const statSentences = $<HTMLElement>('stat-sentences');
const statFlags = $<HTMLElement>('stat-flags');
const scoreNote = $<HTMLParagraphElement>('score-note');
const legend = $<HTMLUListElement>('legend');

// ~50 words is roughly where the classifier has enough signal to be trusted.
const MIN_CONFIDENT_WORDS = 50;

/** One contextual line that explains the score in relation to the flags. */
function noteFor(score: number, words: number, flags: number): string {
  if (words < MIN_CONFIDENT_WORDS)
    return `⚠ Too short to score reliably — add more text (~${MIN_CONFIDENT_WORDS}+ words). Trust the flags, not the number.`;
  if (score < 30 && flags > 0)
    return `Reads clean overall — the ${flags} flag${flags > 1 ? 's' : ''} below mark specific phrases you could still tighten.`;
  if (score >= 70 && flags === 0)
    return `No single construction stands out, but the overall phrasing and rhythm read AI-shaped.`;
  if (score >= 45 && score < 60)
    return `Borderline — the overall style is ambiguous. Use the flags below as the actionable signal.`;
  return '';
}

const loadingEl = $<HTMLDivElement>('loading');
const loadingBar = $<HTMLDivElement>('loading-bar');
const loadingMsg = $<HTMLDivElement>('loading-msg');

const muted = new Set<Category>();
let lastFindings: Finding[] = [];
let parser: Parser | undefined;
let model: Model | undefined;
let busy = false;
let queued = false;

// ── html escaping ────────────────────────────────────────────────────────
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const escape = (s: string) => s.replace(/[&<>]/g, (c) => ESC[c]);

// ── colour for the score (probability ×100): green → amber → red ──────────
function scoreColor(score: number): string {
  if (score < 20) return '#4bd07f';
  if (score < 45) return '#9fd04b';
  if (score < 60) return '#f0b429';
  if (score < 80) return '#f6812e';
  return '#f0463f';
}

// ── render the highlighted backdrop ───────────────────────────────────────
function renderHighlights(text: string, findings: Finding[]): void {
  const segs = segments(text, findings);
  let html = '';
  const findingIndex = new Map<Finding, number>();
  findings.forEach((f, i) => findingIndex.set(f, i));
  for (const seg of segs) {
    const chunk = escape(text.slice(seg.start, seg.end));
    if (seg.finding) {
      const id = findingIndex.get(seg.finding)!;
      html += `<mark class="${seg.finding.category}" data-f="${id}">${chunk}</mark>`;
    } else {
      html += chunk;
    }
  }
  if (text.endsWith('\n') || text === '') html += ' ';
  highlights.innerHTML = html;
}

// ── legend ────────────────────────────────────────────────────────────────
function buildLegend(counts: Record<Category, number>): void {
  legend.innerHTML = '';
  for (const cat of CATEGORY_ORDER) {
    const info = CATEGORIES[cat];
    const count = counts[cat];
    const li = document.createElement('li');
    li.className = count === 0 ? 'empty' : muted.has(cat) ? 'off' : '';
    li.dataset.cat = cat;
    li.innerHTML = `
      <span class="swatch" style="background: var(--c-${cat}-solid)"></span>
      <span class="lbl">${info.label}<small>${info.blurb}</small></span>
      <span class="count">${count}</span>`;
    if (count > 0) li.addEventListener('click', () => toggleCategory(cat));
    legend.appendChild(li);
  }
}

function toggleCategory(cat: Category): void {
  if (muted.has(cat)) muted.delete(cat);
  else muted.add(cat);
  highlights.classList.toggle(`mute-${cat}`, muted.has(cat));
  legend.querySelector(`li[data-cat="${cat}"]`)?.classList.toggle('off', muted.has(cat));
}

// ── main analyse pass (async; the parse runs in WASM) ─────────────────────
async function run(): Promise<void> {
  if (!parser) return;
  if (busy) { queued = true; return; }
  busy = true;
  const text = input.value;
  try {
    const result = await analyze(text, parser, model);
    lastFindings = result.findings;
    renderHighlights(text, result.findings);
    syncScroll();

    scoreNum.textContent = String(result.stats.score);
    verdictEl.textContent = result.stats.verdict;
    statWords.textContent = String(result.stats.words);
    statSentences.textContent = String(result.stats.sentences);
    statFlags.textContent = String(result.findings.length);

    const note = noteFor(result.stats.score, result.stats.words, result.findings.length);
    scoreNote.textContent = note;
    scoreNote.hidden = note === '';
    scoreNote.classList.toggle('warn', result.stats.words < MIN_CONFIDENT_WORDS);

    const col = scoreColor(result.stats.score);
    scoreRing.style.setProperty('--pct', String(result.stats.score));
    scoreRing.style.setProperty('--ring', col);
    verdictEl.style.color = col;
    buildLegend(result.counts);
  } finally {
    busy = false;
    if (queued) { queued = false; void run(); }
  }
}

function syncScroll(): void {
  backdrop.scrollTop = input.scrollTop;
  backdrop.scrollLeft = input.scrollLeft;
}

// ── tooltip on hover ──────────────────────────────────────────────────────
function showTooltip(f: Finding, x: number, y: number): void {
  const info = CATEGORIES[f.category];
  tooltip.innerHTML = `
    <div class="tt-cat" style="color: var(--c-${f.category}-solid)">${info.label}</div>
    <div>${escape(f.message)}</div>`;
  tooltip.hidden = false;
  const pad = 14;
  const rect = tooltip.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + rect.width > window.innerWidth - 8) left = x - rect.width - pad;
  if (top + rect.height > window.innerHeight - 8) top = y - rect.height - pad;
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}
const hideTooltip = () => { tooltip.hidden = true; };

input.addEventListener('mousemove', (e) => {
  const prev = input.style.pointerEvents;
  input.style.pointerEvents = 'none';
  const under = document.elementFromPoint(e.clientX, e.clientY);
  input.style.pointerEvents = prev;
  if (under && under.tagName === 'MARK') {
    const f = lastFindings[Number((under as HTMLElement).dataset.f)];
    if (f) { showTooltip(f, e.clientX, e.clientY); return; }
  }
  hideTooltip();
});
input.addEventListener('mouseleave', hideTooltip);

// ── debounced input (parse is heavier than the old regex pass) ────────────
let timer = 0;
input.addEventListener('input', () => {
  hideTooltip();
  clearTimeout(timer);
  timer = window.setTimeout(run, 400);
});
input.addEventListener('scroll', syncScroll);

$('sample-btn').addEventListener('click', () => { input.value = EXAMPLE; input.focus(); void run(); });
$('clear-btn').addEventListener('click', () => { input.value = ''; input.focus(); void run(); });

// ── boot: load the parser (with progress) then enable analysis ────────────
const FMT = (n: number) => `${(n / 1_000_000).toFixed(0)} MB`;
const STAGE: Record<string, string> = {
  tokenizer: 'Loading tokenizer…',
  classifier: 'Loading detector model…',
  model: 'Downloading parser',
  compiling: 'Compiling parser (WASM)…',
  ready: 'Ready',
};

async function boot(): Promise<void> {
  input.value = EXAMPLE;
  input.disabled = true;
  try {
    const engine = await loadEngine((stage, loaded, total) => {
      loadingMsg.textContent =
        stage === 'model' && total
          ? `Downloading parser — ${FMT(loaded ?? 0)} / ${FMT(total)}`
          : STAGE[stage] ?? stage;
      const pct = stage === 'model' && total ? (loaded ?? 0) / total : stage === 'ready' ? 1 : undefined;
      if (pct !== undefined) loadingBar.style.width = `${Math.round(pct * 100)}%`;
    });
    parser = engine.parser;
    model = engine.model;
    input.disabled = false;
    loadingEl.classList.add('done');
    await run();
    input.focus();
  } catch (err) {
    loadingMsg.textContent = `Failed to load: ${(err as Error).message}`;
    loadingEl.classList.add('error');
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

void boot();
