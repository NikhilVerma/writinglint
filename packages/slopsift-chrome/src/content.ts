import {
  atLeastSeverity,
  DEFAULT_SETTINGS,
  diagnosticSegments,
  type ExtensionSettings,
  type LintDiagnostic,
  type RuntimeResponse,
} from './protocol.js';

type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

interface FieldState {
  element: Editable;
  text: string;
  allLints: LintDiagnostic[];
  lints: LintDiagnostic[];
  request: number;
  timer?: number;
  mirror?: HTMLDivElement;
  highlightName?: string;
  highlightStyle?: HTMLStyleElement;
}

const states = new WeakMap<Editable, FieldState>();
const visibleStates = new Set<FieldState>();
let settings: ExtensionSettings = DEFAULT_SETTINGS;
let active: FieldState | undefined;
let nextHighlight = 0;

const host = document.createElement('div');
host.dataset.slopsift = 'ui';
host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;inset:0;pointer-events:none;';
const shadow = host.attachShadow({ mode: 'closed' });
shadow.innerHTML = `
  <style>
    :host{color:#242421;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif}
    .badge{pointer-events:auto;position:fixed;display:none;min-width:25px;height:25px;padding:0 6px;border:1px solid rgba(0,0,0,.12);border-radius:999px;background:#fbfaf7;color:#6d2727;font:700 11px/23px "SF Mono",Menlo,monospace;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.06);cursor:pointer}
    .badge[data-empty="true"]{color:#426349;background:#edf3ec}
    .panel{pointer-events:auto;position:fixed;display:none;width:min(350px,calc(100vw - 24px));max-height:min(430px,calc(100vh - 24px));overflow:auto;border:1px solid #e5e3dc;border-radius:10px;background:#fbfaf7;box-shadow:0 12px 40px rgba(30,27,20,.12)}
    .head{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;padding:15px 16px;border-bottom:1px solid #e5e3dc;background:rgba(251,250,247,.96)}
    .wordmark{font:650 15px/1 "Helvetica Neue",Helvetica,Arial,sans-serif;letter-spacing:-.02em}.count{color:#77736b;font:500 11px/1.2 "SF Mono",Menlo,monospace}
    .list{padding:5px}.item{width:100%;padding:12px 11px;border:0;border-bottom:1px solid #ebe8e1;background:transparent;color:inherit;text-align:left;cursor:pointer}.item:last-child{border-bottom:0}.item:hover{background:#f2f0ea}
    .meta{display:flex;gap:7px;align-items:center;margin-bottom:6px}.level{padding:3px 5px;border-radius:3px;background:#fbf3db;color:#805b11;font:700 9px/1 "SF Mono",Menlo,monospace;text-transform:uppercase;letter-spacing:.07em}.level[data-level="error"]{background:#fdebec;color:#8d302d}.level[data-level="info"]{background:#e1f3fe;color:#316482}.rule{overflow:hidden;color:#8b877f;font:500 10px/1.2 "SF Mono",Menlo,monospace;text-overflow:ellipsis;white-space:nowrap}.message{font-size:13px;line-height:1.4}.quote{margin-top:6px;overflow:hidden;color:#77736b;font:12px/1.35 Georgia,serif;text-overflow:ellipsis;white-space:nowrap}
    .empty{padding:28px 20px;text-align:center}.empty strong{display:block;margin-bottom:5px;font:600 14px/1.2 "Helvetica Neue",Helvetica,Arial,sans-serif}.empty span{color:#77736b;font-size:12px}
  </style>
  <button class="badge" type="button" aria-label="Open SlopSift diagnostics"></button>
  <section class="panel" role="dialog" aria-label="SlopSift diagnostics"><div class="head"><span class="wordmark">slopsift</span><span class="count"></span></div><div class="list"></div></section>`;
document.documentElement.append(host);

const badge = shadow.querySelector<HTMLButtonElement>('.badge')!;
const panel = shadow.querySelector<HTMLElement>('.panel')!;
const count = shadow.querySelector<HTMLElement>('.count')!;
const list = shadow.querySelector<HTMLElement>('.list')!;

function isEditable(target: EventTarget | null): target is Editable {
  if (!(target instanceof HTMLElement) || target.closest('[data-slopsift="ui"]')) return false;
  if (target instanceof HTMLTextAreaElement) return !target.readOnly && !target.disabled;
  if (target instanceof HTMLInputElement) {
    return ['text', 'search', 'email', 'url'].includes(target.type) && !target.readOnly && !target.disabled;
  }
  return target.isContentEditable;
}

function fieldText(element: Editable): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element.value;
  return element.textContent ?? '';
}

function stateFor(element: Editable): FieldState {
  let state = states.get(element);
  if (!state) {
    state = { element, text: fieldText(element), allLints: [], lints: [], request: 0 };
    states.set(element, state);
    visibleStates.add(state);
  }
  return state;
}

function filtered(lints: readonly LintDiagnostic[]): LintDiagnostic[] {
  return lints.filter((lint) => atLeastSeverity(lint, settings.minimumSeverity));
}

function clearDecoration(state: FieldState): void {
  state.mirror?.remove();
  state.mirror = undefined;
  state.highlightStyle?.remove();
  state.highlightStyle = undefined;
  if (state.highlightName) {
    (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.delete(state.highlightName);
    state.highlightName = undefined;
  }
}

function mirrorStyles(mirror: HTMLDivElement, element: HTMLInputElement | HTMLTextAreaElement): void {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const properties = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'letterSpacing', 'lineHeight',
    'textAlign', 'textIndent', 'textTransform', 'wordSpacing', 'paddingTop', 'paddingRight', 'paddingBottom',
    'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'boxSizing',
  ] as const;
  for (const property of properties) mirror.style[property] = style[property];
  mirror.style.cssText += `;position:fixed;pointer-events:none;z-index:2147483645;overflow:hidden;color:transparent;background:transparent;border-color:transparent;width:${rect.width}px;height:${rect.height}px;left:${rect.left}px;top:${rect.top}px;white-space:${element instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre'};overflow-wrap:${element instanceof HTMLTextAreaElement ? 'break-word' : 'normal'};`;
  mirror.scrollTop = element.scrollTop;
  mirror.scrollLeft = element.scrollLeft;
}

function decorateControl(state: FieldState, element: HTMLInputElement | HTMLTextAreaElement): void {
  const mirror = document.createElement('div');
  mirror.dataset.slopsift = 'mirror';
  mirror.setAttribute('aria-hidden', 'true');
  mirrorStyles(mirror, element);
  for (const segment of diagnosticSegments(state.text, state.lints)) {
    const span = document.createElement('span');
    span.textContent = state.text.slice(segment.start, segment.end);
    if (segment.severity) {
      const color = segment.severity === 'error' ? '#b5443f' : segment.severity === 'warn' ? '#b47a16' : '#477e9e';
      span.style.cssText = `text-decoration-line:underline;text-decoration-style:wavy;text-decoration-thickness:1.5px;text-decoration-color:${color};text-underline-offset:3px;`;
    }
    mirror.append(span);
  }
  document.documentElement.append(mirror);
  state.mirror = mirror;
}

function textNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  return nodes;
}

function boundary(nodes: readonly Text[], offset: number): { node: Text; offset: number } | undefined {
  let cursor = 0;
  for (const node of nodes) {
    const end = cursor + node.data.length;
    if (offset <= end) return { node, offset: Math.max(0, offset - cursor) };
    cursor = end;
  }
  const last = nodes.at(-1);
  return last ? { node: last, offset: last.data.length } : undefined;
}

function decorateContentEditable(state: FieldState, element: HTMLElement): void {
  const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (!highlights || !HighlightCtor) return;
  const nodes = textNodes(element);
  const ranges = state.lints.flatMap((lint) => {
    const start = boundary(nodes, lint.start);
    const end = boundary(nodes, lint.end);
    if (!start || !end) return [];
    const range = new Range();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return [range];
  });
  const name = `slopsift-${nextHighlight++}`;
  highlights.set(name, new HighlightCtor(...ranges));
  const style = document.createElement('style');
  style.dataset.slopsiftHighlight = name;
  style.textContent = `::highlight(${name}){text-decoration:underline wavy #b47a16 1.5px;text-underline-offset:3px}`;
  document.documentElement.append(style);
  state.highlightName = name;
  state.highlightStyle = style;
}

function decorate(state: FieldState): void {
  clearDecoration(state);
  if (!settings.enabled || !state.element.isConnected || !state.lints.length) return;
  if (state.element instanceof HTMLInputElement || state.element instanceof HTMLTextAreaElement) {
    decorateControl(state, state.element);
  } else {
    decorateContentEditable(state, state.element);
  }
}

function positionUI(): void {
  if (!active || !active.element.isConnected || !settings.enabled) {
    badge.style.display = 'none';
    panel.style.display = 'none';
    return;
  }
  const rect = active.element.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > innerHeight) {
    badge.style.display = 'none';
    panel.style.display = 'none';
    return;
  }
  badge.style.display = 'block';
  badge.style.left = `${Math.max(6, Math.min(innerWidth - 34, rect.right - 31))}px`;
  badge.style.top = `${Math.max(6, Math.min(innerHeight - 31, rect.bottom - 31))}px`;
  if (panel.style.display !== 'none') {
    panel.style.left = `${Math.max(12, Math.min(innerWidth - 362, rect.right - 350))}px`;
    panel.style.top = `${Math.max(12, Math.min(innerHeight - 442, rect.bottom + 7))}px`;
  }
  if (active.mirror && (active.element instanceof HTMLInputElement || active.element instanceof HTMLTextAreaElement)) {
    mirrorStyles(active.mirror, active.element);
  }
}

function renderPanel(): void {
  if (!active) return;
  badge.textContent = active.lints.length ? String(active.lints.length) : 'OK';
  badge.dataset.empty = String(active.lints.length === 0);
  badge.setAttribute(
    'aria-label',
    active.lints.length ? `Open ${active.lints.length} SlopSift diagnostics` : 'No SlopSift diagnostics',
  );
  count.textContent = `${active.lints.length} ${active.lints.length === 1 ? 'finding' : 'findings'}`;
  list.replaceChildren();
  if (!active.lints.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const title = document.createElement('strong');
    title.textContent = 'Nothing obvious.';
    const detail = document.createElement('span');
    detail.textContent = 'That is not the same as nothing wrong.';
    empty.append(title, detail);
    list.append(empty);
    return;
  }
  for (const lint of active.lints.slice(0, 30)) {
    const item = document.createElement('button');
    item.className = 'item';
    item.type = 'button';
    const meta = document.createElement('div');
    meta.className = 'meta';
    const level = document.createElement('span');
    level.className = 'level';
    level.dataset.level = lint.severity;
    level.textContent = lint.severity;
    const rule = document.createElement('span');
    rule.className = 'rule';
    rule.textContent = lint.ruleId.replace('ai-style/', '');
    meta.append(level, rule);
    const message = document.createElement('div');
    message.className = 'message';
    message.textContent = lint.message;
    const quote = document.createElement('div');
    quote.className = 'quote';
    quote.textContent = lint.text;
    item.append(meta, message, quote);
    item.addEventListener('click', () => selectLint(active!, lint));
    list.append(item);
  }
}

function selectLint(state: FieldState, lint: LintDiagnostic): void {
  state.element.focus();
  if (state.element instanceof HTMLInputElement || state.element instanceof HTMLTextAreaElement) {
    state.element.setSelectionRange(lint.start, lint.end);
    return;
  }
  const nodes = textNodes(state.element);
  const start = boundary(nodes, lint.start);
  const end = boundary(nodes, lint.end);
  if (!start || !end) return;
  const range = new Range();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const selection = getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

async function lint(state: FieldState): Promise<void> {
  const text = fieldText(state.element);
  state.text = text;
  const request = ++state.request;
  if (!settings.enabled || text.trim().length < 20) {
    state.allLints = [];
    state.lints = [];
    decorate(state);
    if (active === state) renderPanel();
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage<RuntimeResponse>({ type: 'lint', text });
    if (request !== state.request || fieldText(state.element) !== text) return;
    state.allLints = response.ok && 'lints' in response ? response.lints : [];
    state.lints = filtered(state.allLints);
    decorate(state);
    if (active === state) renderPanel();
  } catch {
    // Extension reloads invalidate old content-script contexts. Retry on input.
  }
}

function schedule(state: FieldState): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = window.setTimeout(() => void lint(state), 550);
}

document.addEventListener('focusin', (event) => {
  if (!isEditable(event.target)) return;
  active = stateFor(event.target);
  renderPanel();
  positionUI();
  schedule(active);
}, true);

document.addEventListener('input', (event) => {
  if (!isEditable(event.target)) return;
  const state = stateFor(event.target);
  clearDecoration(state);
  schedule(state);
}, true);

document.addEventListener('scroll', positionUI, true);
window.addEventListener('resize', positionUI);
badge.addEventListener('click', () => {
  panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
  renderPanel();
  positionUI();
});

void chrome.storage.local.get(DEFAULT_SETTINGS).then((stored) => {
  settings = { ...DEFAULT_SETTINGS, ...stored } as ExtensionSettings;
  positionUI();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.enabled) settings.enabled = Boolean(changes.enabled.newValue);
  if (changes.minimumSeverity) {
    settings.minimumSeverity = changes.minimumSeverity.newValue as ExtensionSettings['minimumSeverity'];
  }
  for (const state of visibleStates) {
    state.lints = filtered(state.allLints);
    decorate(state);
  }
  renderPanel();
  positionUI();
});
