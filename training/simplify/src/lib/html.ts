// Minimal HTML-to-text extraction for old-school essay pages (paulgraham.com
// is table-and-font-tag HTML). Not a general-purpose parser: it strips tags
// and decodes common entities, which is enough for plain essay bodies.

const namedEntities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => namedEntities[name.toLowerCase()] ?? match);
}

export function extractHtmlText(html: string): { title: string; text: string } {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim());
  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  body = body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|table|blockquote|h[1-6]|li|ul|ol)>/gi, '\n\n')
    .replace(/<(p|blockquote)[^>]*>/gi, '\n\n');
  body = decodeEntities(body.replace(/<[^>]+>/g, ''));
  body = body
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text: body };
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w !== '').length;
}
