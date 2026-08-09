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

/** Browser-safe equivalent of node:path's extname for file-like paths. */
function extname(path: string): string {
  const clean = path.split(/[?#]/, 1)[0] ?? path;
  const base = clean.slice(Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\')) + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot);
}

export const DEFAULT_EXTENSIONS = [...PROSE, ...HASH, ...DASH, ...HTML, ...MARKUP_SOURCE, ...C_STYLE].sort();

export function inputKind(path: string): InputKind | undefined {
  const ext = extname(path).toLowerCase();
  if (PROSE.has(ext) || HTML.has(ext) || ext === '.astro') return 'prose';
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

const TABLE_DELIMITER = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/;

/**
 * Mark Markdown table cells and rows as parser boundaries. U+2029 is one UTF-16
 * unit, like the pipe/newline it replaces, so source offsets remain exact.
 */
function separateMarkdownTables(output: string[], source: string): void {
  const lines = [...source.matchAll(/.*(?:\r?\n|$)/g)].filter((match) => match[0].length > 0);
  for (let delimiter = 1; delimiter < lines.length; delimiter++) {
    const delimiterLine = lines[delimiter]!;
    const previousLine = lines[delimiter - 1]!;
    if (!TABLE_DELIMITER.test(delimiterLine[0].trimEnd()) || !previousLine[0].includes('|')) continue;

    let end = delimiter + 1;
    while (end < lines.length && lines[end]![0].trim() && lines[end]![0].includes('|')) end++;
    for (let row = delimiter - 1; row < end; row++) {
      const match = lines[row]!;
      const start = match.index;
      if (row === delimiter) {
        maskRange(output, source, start, start + match[0].length);
        continue;
      }
      for (let index = start; index < start + match[0].length; index++) {
        if (source[index] === '|' || source[index] === '\n') output[index] = '\u2029';
      }
    }
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
  separateMarkdownTables(output, source);

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

function maskAstroSource(source: string): string {
  const output = [...source];
  const frontmatter = source.match(/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/)?.[0];
  if (frontmatter) maskRange(output, source, 0, frontmatter.length);

  // Frontmatter has already been blanked. Starting after it also prevents
  // braces and apostrophes in TypeScript comments/strings from being mistaken
  // for Astro template expressions.
  let index = frontmatter?.length ?? 0;
  while (index < source.length) {
    if (source[index] !== '{') { index++; continue; }
    const start = index;
    let depth = 1;
    let quote = '';
    index++;
    while (index < source.length && depth > 0) {
      const char = source[index]!;
      if (quote) {
        if (char === '\\') index += 2;
        else {
          if (char === quote) quote = '';
          index++;
        }
        continue;
      }
      if (char === '"' || char === "'" || char === '`') quote = char;
      else if (char === '{') depth++;
      else if (char === '}') depth--;
      index++;
    }
    maskRange(output, source, start, index);
  }
  return output.join('');
}

function sourceFragment(source: string, start: number, end: number): ExtractedInput {
  return {
    text: source.slice(start, end),
    sourceRange(localStart, localEnd) {
      return [start + localStart, start + localEnd];
    },
  };
}

function combineExtracted(parts: ExtractedInput[]): ExtractedInput {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for (const part of parts) {
    if (!part.text.trim()) continue;
    if (text) {
      const anchor = starts.at(-1) ?? 0;
      text += '\n\n';
      starts.push(anchor, anchor);
      ends.push(anchor, anchor);
    }
    for (let index = 0; index < part.text.length; index++) {
      const [start, end] = part.sourceRange(index, index + 1);
      text += part.text[index]!;
      starts.push(start);
      ends.push(end);
    }
  }
  return {
    text,
    sourceRange(start, end) {
      if (starts.length === 0) return [0, 0];
      const first = Math.max(0, Math.min(start, starts.length - 1));
      const last = Math.max(first, Math.min(Math.max(start, end - 1), ends.length - 1));
      return [starts[first]!, ends[last]!];
    },
  };
}

function astroMetadata(source: string, masked: string, rendered: string): ExtractedInput[] {
  const ranges: Array<[number, number]> = [];
  const addValue = (match: RegExpMatchArray, value: string) => {
    if (!value.trim() || rendered.includes(value)) return;
    const local = match[0].lastIndexOf(value);
    if (local >= 0) ranges.push([match.index! + local, match.index! + local + value.length]);
  };

  for (const match of masked.matchAll(/\b(?:title|description|aria-label|placeholder|alt)\s*=\s*(["'])(.*?)\1/gis)) {
    addValue(match, match[2]!);
  }
  for (const tag of masked.matchAll(/<meta\b[^>]*>/gis)) {
    if (!/\b(?:name|property)\s*=\s*(["'])(?:description|og:description|twitter:description)\1/i.test(tag[0])) continue;
    const content = tag[0].match(/\bcontent\s*=\s*(["'])(.*?)\1/is);
    if (!content?.[2]) continue;
    const local = tag[0].indexOf(content[0]) + content[0].lastIndexOf(content[2]);
    const start = tag.index! + local;
    if (!rendered.includes(content[2])) ranges.push([start, start + content[2].length]);
  }
  for (const match of masked.matchAll(/<title\b[^>]*>([^<{]+)<\/title>/gis)) addValue(match, match[1]!);

  const unique = [...new Map(ranges.map((range) => [`${range[0]}:${range[1]}`, range])).values()]
    .sort((left, right) => left[0] - right[0]);
  return unique.map(([start, end]) => sourceFragment(source, start, end));
}

function extractAstro(source: string): ExtractedInput {
  const masked = maskAstroSource(source);
  const body = extractHtml(masked);
  return combineExtracted([body, ...astroMetadata(source, masked, body.text)]);
}

interface TemplateLiteral {
  contentStart: number;
  contentEnd: number;
  end: number;
  expressions: Array<[number, number]>;
}

function scanTemplateLiteral(source: string, start: number): TemplateLiteral {
  const expressions: Array<[number, number]> = [];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') { index += 2; continue; }
    if (source[index] === '`') return { contentStart: start + 1, contentEnd: index, end: index + 1, expressions };
    if (source.startsWith('${', index)) {
      const expressionStart = index;
      let depth = 1;
      let quote = '';
      index += 2;
      while (index < source.length && depth > 0) {
        const char = source[index]!;
        if (quote) {
          if (char === '\\') index += 2;
          else {
            if (char === quote) quote = '';
            index++;
          }
          continue;
        }
        if (char === '"' || char === "'" || char === '`') quote = char;
        else if (char === '{') depth++;
        else if (char === '}') depth--;
        index++;
      }
      expressions.push([expressionStart, index]);
      continue;
    }
    index++;
  }
  return { contentStart: start + 1, contentEnd: source.length, end: source.length, expressions };
}

function scanCStyle(source: string, output: string[]): void {
  scanDelimited(source, output, ['//'], [['/*', '*/']]);
  // JSDoc uses a leading `*` as margin decoration. Mask that marker so a line
  // containing only ` *` remains a real blank-line paragraph boundary, while
  // preserving every source offset for diagnostics.
  for (const block of source.matchAll(/\/\*\*[\s\S]*?(?:\*\/|$)/g)) {
    const start = block.index;
    const end = start + block[0].length;
    let lineStart = source.indexOf('\n', start) + 1;
    while (lineStart > 0 && lineStart < end) {
      let marker = lineStart;
      while (marker < end && (source[marker] === ' ' || source[marker] === '\t')) marker++;
      if (source[marker] === '*') output[marker] = ' ';
      lineStart = source.indexOf('\n', lineStart);
      if (lineStart < 0 || lineStart >= end) break;
      lineStart++;
    }
  }
  let index = 0;
  while (index < source.length) {
    const character = source[index]!;
    if (character === '"' || character === "'") {
      const quote = character;
      index++;
      while (index < source.length) {
        if (source[index] === '\\') index += 2;
        else if (source[index] === quote) { index++; break; }
        else index++;
      }
      continue;
    }
    if (character !== '`') { index++; continue; }
    const template = scanTemplateLiteral(source, index);
    const content = source.slice(template.contentStart, template.contentEnd);
    const words = content.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
    if (content.includes('\n') && words >= 5) {
      copyRange(output, source, template.contentStart, template.contentEnd);
      for (const [start, end] of template.expressions) maskRange(output, source, start, end);
    }
    index = template.end;
  }
}

export function extractInput(path: string, source: string): ExtractedInput {
  const ext = extname(path).toLowerCase();
  if (HTML.has(ext)) return extractHtml(source);
  if (ext === '.astro') return extractAstro(source);
  const text = extractLintText(path, source);
  return { text, sourceRange: (start, end) => [start, end] };
}

/** Return prose at its original UTF-16 offsets, blanking all non-comment code. */
export function extractLintText(path: string, source: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === '.md' || ext === '.mdx' || ext === '.markdown') return extractMarkdown(source);
  if (PROSE.has(ext)) return source;
  if (HTML.has(ext)) return extractHtml(source).text;
  if (ext === '.astro') return extractAstro(source).text;
  const output = blank(source);
  if (HASH.has(ext)) scanDelimited(source, output, ['#'], []);
  else if (DASH.has(ext)) scanDelimited(source, output, ['--'], [['/*', '*/']]);
  else if (MARKUP_SOURCE.has(ext)) scanDelimited(source, output, [], [['<!--', '-->']]);
  else scanCStyle(source, output);
  return output.join('');
}
