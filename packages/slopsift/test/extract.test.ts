import assert from 'node:assert/strict';
import test from 'node:test';
import { splitSentences } from 'writinglint-parser-node/tokenizer';
import { extractInput, extractLintText, inputKind } from '../src/extract.js';
import { makeResult } from '../src/format.js';

test('Markdown is linted as complete prose', () => {
  const source = '# Title\n\nIn today’s landscape, this matters.';
  assert.equal(extractLintText('README.md', source), source);
  assert.equal(inputKind('README.md'), 'prose');
});

test('browser-style and URL-like paths resolve without node:path', () => {
  assert.equal(inputKind('C:\\drafts\\post.MD'), 'prose');
  assert.equal(inputKind('/drafts/post.md?mode=edit#section'), 'prose');
  assert.equal(inputKind('.hidden'), undefined);
});

test('TypeScript extraction keeps comments and exact source offsets', () => {
  const source = `const value = "// not a comment";\n// In today's landscape, we leverage things.\nrun();`;
  const extracted = extractLintText('index.ts', source);
  assert.equal(extracted.length, source.length);
  assert.equal(extracted.slice(source.indexOf('In today'), source.indexOf('In today') + 10), "In today's");
  assert.equal(extracted.includes('not a comment'), false);
});

test('JSDoc margin stars preserve paragraph boundaries', () => {
  const source = [
    '/**',
    ' * The first paragraph explains the normal behavior.',
    ' *',
    ' * The second paragraph explains the exception.',
    ' */',
  ].join('\n');
  const extracted = extractLintText('example.ts', source);
  assert.match(extracted, /The first paragraph explains the normal behavior\.\n\s*\n\s*The second paragraph/);
  assert.equal(extracted.length, source.length);
  assert.equal(extracted.indexOf('The second paragraph'), source.indexOf('The second paragraph'));
});

test('ESLint-shaped locations point into the original code file', () => {
  const source = 'const x = 1;\n// Ultimately, this is transformative.\n';
  const start = source.indexOf('Ultimately');
  const result = makeResult('x.ts', source, [{
    ruleId: 'ai-style/throat-clearing', category: 'meta', severity: 'warn', confidence: 'medium',
    start, end: start + 10, text: 'Ultimately', message: 'Delete the canned transition.',
  }]);
  assert.equal(result.messages[0]?.line, 2);
  assert.equal(result.messages[0]?.column, 4);
});

test('HTML extraction keeps visible prose and blanks non-rendered content', () => {
  const source = `<!doctype html><html><head><title>Hidden title</title><style>.x{}</style></head><body><main><h1>Visible heading</h1><p>Ultimately, this is transformative.</p><pre>Hidden code prose</pre><svg><text>Hidden diagram</text></svg></main><script>const hidden = 'prose';</script></body></html>`;
  const extracted = extractLintText('index.html', source);
  assert.equal(extracted.includes('Visible heading'), true);
  assert.equal(extracted.includes('Ultimately, this is transformative.'), true);
  assert.equal(extracted.includes('Hidden title'), false);
  assert.equal(extracted.includes('Hidden code prose'), false);
  assert.equal(extracted.includes('Hidden diagram'), false);
  assert.equal(extracted.includes("const hidden = 'prose'"), false);
});

test('HTML comments and attributes are not treated as rendered prose', () => {
  const source = `<p title="Ultimately, hidden">Direct sentence.</p><!-- Ultimately, hidden comment. -->`;
  const extracted = extractLintText('index.html', source);
  assert.equal(extracted.includes('Direct sentence.'), true);
  assert.equal(extracted.includes('Ultimately'), false);
});

test('HTML entities are decoded for parsing and mapped to their source span', () => {
  const source = `<p>It wasn&#39;t merely ornate &amp; vague.</p>`;
  const extracted = extractInput('index.html', source);
  assert.equal(extracted.text.trim(), "It wasn't merely ornate & vague.");
  const apostrophe = extracted.text.indexOf("'");
  assert.equal(source.slice(...extracted.sourceRange(apostrophe, apostrophe + 1)), '&#39;');
  const phraseStart = extracted.text.indexOf('ornate');
  const phraseEnd = extracted.text.indexOf('vague') + 'vague'.length;
  assert.equal(source.slice(...extracted.sourceRange(phraseStart, phraseEnd)), 'ornate &amp; vague');
});

test('HTML source ranges do not absorb removed opening tags', () => {
  const source = '<span class="icon">💡</span>';
  const extracted = extractInput('index.html', source);
  const start = extracted.text.indexOf('💡');
  assert.equal(source.slice(...extracted.sourceRange(start, start + '💡'.length)), '💡');
});

test('Markdown extraction excludes metadata, code, and image alt text while retaining prose offsets', () => {
  const source = `---\ntitle: Harness revolutionary systems\n---\n\nDirect prose.\n\n\`inline harness\`\n\n\`\`\`ts\nconst arrows = "→ → →";\nconst text = "delve";\n\`\`\`\n\n![A revolutionary harness diagram](/images/harness.webp)\n\nAfter code. [Link](https://example.com/harness).`;
  const extracted = extractLintText('post.md', source);
  assert.equal(extracted.length, source.length);
  assert.equal(extracted.includes('Direct prose.'), true);
  assert.equal(extracted.includes('After code.'), true);
  assert.equal(extracted.includes('revolutionary'), false);
  assert.equal(extracted.includes('inline harness'), false);
  assert.equal(extracted.includes('arrows'), false);
  assert.equal(extracted.includes('revolutionary harness diagram'), false);
  assert.equal(extracted.includes('https://'), false);
});

test('Markdown table cells and rows become parser boundaries', () => {
  const source = `| Rule | Description |
| --- | --- |
| first | A short explanation without sentence punctuation |
| second | Another short explanation without sentence punctuation |`;
  const extracted = extractLintText('README.md', source);
  const sentences = splitSentences(extracted).map((sentence) => sentence.text.trim()).filter(Boolean);
  assert.deepEqual(sentences, [
    'Rule',
    'Description',
    'first',
    'A short explanation without sentence punctuation',
    'second',
    'Another short explanation without sentence punctuation',
  ]);
});

test('Astro extraction keeps visible page copy and excludes frontmatter code', () => {
  const source = `---
const secretImplementation = "Delve into revolutionary internals.";
const hiddenHelper = () => {
  // It's implementation code, not page copy.
  return { secretImplementation };
};
---
<main>
  <h1>Durable software for careful teams</h1>
  <p>Ultimately, this visible paragraph makes a sweeping promise.</p>
  <button>Read the field notes</button>
</main>`;
  const extracted = extractLintText('index.astro', source);
  assert.equal(extracted.includes('Durable software for careful teams'), true);
  assert.equal(extracted.includes('Ultimately, this visible paragraph makes a sweeping promise.'), true);
  assert.equal(extracted.includes('Read the field notes'), true);
  assert.equal(extracted.includes('secretImplementation'), false);
  assert.equal(extracted.includes('revolutionary internals'), false);
});

test('Astro extraction includes static page titles and descriptions', () => {
  const source = `<Layout
  title="The durable systems field guide"
  description="A practical guide to keeping important software understandable."
>
  <meta name="description" content="Notes on maintaining systems that have to last." />
  <title>Durable systems without the ceremony</title>
  <p>Visible body copy.</p>
</Layout>`;
  const extracted = extractLintText('guide.astro', source);
  assert.equal(extracted.includes('The durable systems field guide'), true);
  assert.equal(extracted.includes('A practical guide to keeping important software understandable.'), true);
  assert.equal(extracted.includes('Notes on maintaining systems that have to last.'), true);
  assert.equal(extracted.includes('Durable systems without the ceremony'), true);
});

test('TypeScript extraction keeps substantial multiline template prose', () => {
  const source = `export function GET() {
  return new Response(\`# Product guide

Ultimately, this platform unlocks a revolutionary new era for every team.

The guide is returned as plain text for local tools.\`);
}`;
  const extracted = extractLintText('llms.txt.ts', source);
  assert.equal(extracted.includes('# Product guide'), true);
  assert.equal(extracted.includes('Ultimately, this platform unlocks a revolutionary new era'), true);
  assert.equal(extracted.includes('return new Response'), false);
});
