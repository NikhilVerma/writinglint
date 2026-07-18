import { extname } from 'node:path';

export type InputKind = 'prose' | 'comments';
export interface ExtractedInput {
  text: string;
  /** Map an extracted range back to source UTF-16 boundaries. */
  sourceRange(start: number, end: number): [number, number];
}

const PROSE = new Set(['.md', '.mdx', '.markdown', '.txt', '.text', '.rst', '.adoc']);
const HASH = new Set(['.py', '.pyi', '.rb', '.sh', '.bash', '.zsh', '.fish', '.yaml', '.yml', '.toml', '.r']);
const DASH = new Set(['.sql', '.lua', '.hs']);
const HTML = new Set(['.html', '.htm']);
const MARKUP_SOURCE = new Set(['.vue', '.svelte', '.astro', '.xml', '.svg']);
const C_STYLE = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.java', '.kt', '.kts',
  '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.cs', '.go', '.rs', '.swift', '.scala',
  '.dart', '.php', '.css', '.scss', '.sass', '.less', '.sol',
]);

export const DEFAULT_EXTENSIONS = [...PROSE, ...HASH, ...DASH, ...HTML, ...MARKUP_SOURCE, ...C_STYLE].sort();

export function inputKind(path: string): InputKind | undefined {
  const ext = extname(path).toLowerCase();
  if (PROSE.has(ext) || HTML.has(ext)) return 'prose';
  if (HASH.has(ext) || DASH.has(ext) || MARKUP_SOURCE.has(ext) || C_STYLE.has(ext)) return 'comments';
  return undefined;
}

function blank(source: string): string[] {
  return [...source].map((char) => (char === '\n' || char === '\r' ? char : ' '));
}

function copyRange(output: string[], source: string, start: number, end: number): void {
  for (let index = start; index < end; index++) output[index] = source[index]!;
}

function scanDelimited(source: string, output: string[], line: string[], blocks: Array<[string, string]>): void {
  let index = 0;
  let quote = '';
  while (index < source.length) {
    const char = source[index]!;
    if (quote) {
      if (char === '\\') index += 2;
      else { if (char === quote) quote = ''; index++; }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; index++; continue; }
    const lineMarker = line.find((marker) => source.startsWith(marker, index));
    if (lineMarker) {
      const content = index + lineMarker.length;
      const end = source.indexOf('\n', content);
      copyRange(output, source, content, end < 0 ? source.length : end);
      index = end < 0 ? source.length : end;
      continue;
    }
    const block = blocks.find(([open]) => source.startsWith(open, index));
    if (block) {
      const content = index + block[0].length;
      const close = source.indexOf(block[1], content);
      const end = close < 0 ? source.length : close;
      copyRange(output, source, content, end);
      index = close < 0 ? source.length : close + block[1].length;
      continue;
    }
    index++;
  }
}

const HIDDEN_HTML = new Set(['head', 'script', 'style', 'template', 'svg', 'noscript', 'code', 'pre']);
const BLOCK_HTML = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr',
  'li', 'main', 'nav', 'ol', 'p', 'section', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'tr', 'ul',
]);

function tagEnd(source: string, start: number): number {
  let quote = '';
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index]!;
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '>') return index + 1;
  }
  return source.length;
}

const ENTITIES: Record<string, string> = {
  amp: '&', apos: "'", gt: '>', hellip: '…', laquo: '«', ldquo: '“', lsquo: '‘',
  lt: '<', mdash: '—', nbsp: ' ', ndash: '–', quot: '"', raquo: '»', rdquo: '”', rsquo: '’',
};

function decodeEntity(raw: string): string | undefined {
  const body = raw.slice(1, -1);
  if (body.startsWith('#x') || body.startsWith('#X')) {
    const point = Number.parseInt(body.slice(2), 16);
    return Number.isFinite(point) ? String.fromCodePoint(point) : undefined;
  }
  if (body.startsWith('#')) {
    const point = Number.parseInt(body.slice(1), 10);
    return Number.isFinite(point) ? String.fromCodePoint(point) : undefined;
  }
  return ENTITIES[body];
}

/** Decode rendered HTML text and retain a boundary map into the original source. */
function extractHtml(source: string): ExtractedInput {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  const hidden: string[] = [];
  const emit = (value: string, start: number, end: number) => {
    for (let unit = 0; unit < value.length; unit++) {
      text += value[unit]!;
      starts.push(start);
      ends.push(unit === value.length - 1 ? end : start);
    }
  };
  const separate = (at: number) => {
    if (text && !/\s$/.test(text)) emit(' ', at, at);
  };
  const separateBlock = (at: number) => {
    if (!text) return;
    while (!text.endsWith('\n\n')) emit('\n', at, at);
  };
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      const close = source.indexOf('-->', index + 4);
      index = close < 0 ? source.length : close + 3;
      continue;
    }
    if (source[index] === '<') {
      const end = tagEnd(source, index);
      const raw = source.slice(index + 1, end - 1).trim();
      const closing = raw.startsWith('/');
      const name = raw.replace(/^\//, '').match(/^([A-Za-z][\w:-]*)/)?.[1]?.toLowerCase();
      if (name && HIDDEN_HTML.has(name)) {
        if (closing) {
          const position = hidden.lastIndexOf(name);
          if (position >= 0) hidden.splice(position, 1);
        } else if (!raw.endsWith('/')) hidden.push(name);
      }
      if (hidden.length === 0) {
        if (name && BLOCK_HTML.has(name)) separateBlock(index);
        else if (name === 'br') emit('\n', index, index);
        else separate(index);
      }
      index = end;
      continue;
    }
    if (hidden.length === 0 && source[index] === '&') {
      const match = source.slice(index).match(/^&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/i)?.[0];
      const decoded = match && decodeEntity(match);
      if (match && decoded !== undefined) {
        emit(decoded, index, index + match.length);
        index += match.length;
        continue;
      }
    }
    if (hidden.length === 0) emit(source[index]!, index, index + 1);
    index++;
  }
  return {
    text,
    sourceRange(start: number, end: number) {
      if (starts.length === 0) return [0, 0];
      const first = Math.max(0, Math.min(start, starts.length - 1));
      const last = Math.max(first, Math.min(Math.max(start, end - 1), ends.length - 1));
      return [starts[first]!, ends[last]!];
    },
  };
}

function maskRange(output: string[], source: string, start: number, end: number): void {
  for (let index = start; index < end; index++) {
    if (source[index] !== '\n' && source[index] !== '\r') output[index] = ' ';
  }
}

/** Remove Markdown syntax regions that are not authorial prose, preserving offsets. */
function extractMarkdown(source: string): string {
  const output = [...source];
  const lines = source.matchAll(/.*(?:\r?\n|$)/g);
  let fence: { marker: string; start: number } | undefined;
  let frontmatter = source.startsWith('---\n') || source.startsWith('---\r\n');
  for (const match of lines) {
    const line = match[0];
    if (!line) continue;
    const start = match.index;
    const trimmed = line.trim();
    if (frontmatter) {
      maskRange(output, source, start, start + line.length);
      if (start > 0 && (trimmed === '---' || trimmed === '...')) frontmatter = false;
      continue;
    }
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      maskRange(output, source, start, start + line.length);
      if (new RegExp(`^\\s{0,3}${fence.marker[0]}{${fence.marker.length},}\\s*$`).test(trimmed)) fence = undefined;
      continue;
    }
    if (fenceMatch) {
      fence = { marker: fenceMatch[1]!, start };
      maskRange(output, source, start, start + line.length);
      continue;
    }
    if (/^(?: {4}|\t)/.test(line)) maskRange(output, source, start, start + line.length);
  }

  const visible = output.join('');
  // Attributed inline quotations followed by a footnote belong to the cited
  // author, not the Markdown author being linted.
  for (const match of visible.matchAll(/(?:"[^"\n]+"|“[^”\n]+”)\s*(?=\[\^)/g)) {
    maskRange(output, source, match.index, match.index + match[0].length);
  }
  // Inline code (matching backtick run), link destinations, and footnote refs.
  for (const match of visible.matchAll(/(`+)([^\n]*?)\1/g)) maskRange(output, source, match.index, match.index + match[0].length);
  // Image alt text is accessibility metadata, not article prose. It should not
  // participate in paragraph rhythm, repetition, or style aggregation.
  for (const match of visible.matchAll(/!\[[^\]\n]*\]\([^\n)]*\)/g)) maskRange(output, source, match.index, match.index + match[0].length);
  for (const match of visible.matchAll(/\]\([^\n)]*\)/g)) maskRange(output, source, match.index + 1, match.index + match[0].length);
  for (const match of visible.matchAll(/\[\^[^\]]+\]/g)) maskRange(output, source, match.index, match.index + match[0].length);
  // Markdown blockquotes are cited material by default. A future flag can opt
  // into linting quotations when the user owns that prose too.
  for (const match of visible.matchAll(/^\s{0,3}>.*$/gm)) maskRange(output, source, match.index, match.index + match[0].length);
  // Raw HTML tags are markup; their text children remain available.
  for (const match of visible.matchAll(/<[^>]+>/g)) maskRange(output, source, match.index, match.index + match[0].length);
  return output.join('');
}

export function extractInput(path: string, source: string): ExtractedInput {
  const ext = extname(path).toLowerCase();
  if (HTML.has(ext)) return extractHtml(source);
  const text = extractLintText(path, source);
  return { text, sourceRange: (start, end) => [start, end] };
}

/** Return prose at its original UTF-16 offsets, blanking all non-comment code. */
export function extractLintText(path: string, source: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === '.md' || ext === '.mdx' || ext === '.markdown') return extractMarkdown(source);
  if (PROSE.has(ext)) return source;
  if (HTML.has(ext)) return extractHtml(source).text;
  const output = blank(source);
  if (HASH.has(ext)) scanDelimited(source, output, ['#'], []);
  else if (DASH.has(ext)) scanDelimited(source, output, ['--'], [['/*', '*/']]);
  else if (MARKUP_SOURCE.has(ext)) scanDelimited(source, output, [], [['<!--', '-->']]);
  else scanDelimited(source, output, ['//'], [['/*', '*/']]);
  return output.join('');
}
