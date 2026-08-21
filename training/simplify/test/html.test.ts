import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decodeEntities, extractHtmlText } from '../src/lib/html.ts';
import { extractMonthYearDate, parseArticleList, parsePostLinks, withinLengthBand } from '../src/workflows/human-pairs.ts';

const essayPage = [
  '<html><head><title>How to Test &amp; Verify</title></head><body>',
  '<script>track();</script>',
  '<table width="435"><tr><td>',
  '<font size="2" face="verdana">March 2020<br><br>',
  'The first paragraph says one thing.<br><br>',
  'The second &mdash; with an entity &#8212; says another.</font>',
  '</td></tr></table>',
  '</body></html>',
].join('\n');

test('extractHtmlText pulls title and paragraph text from table-layout HTML', () => {
  const { title, text } = extractHtmlText(essayPage);
  assert.equal(title, 'How to Test & Verify');
  assert.ok(text.includes('March 2020'));
  assert.ok(text.includes('The first paragraph says one thing.'));
  assert.ok(text.includes('The second — with an entity — says another.'));
  assert.ok(!text.includes('track();'));
  assert.ok(!text.includes('<'));
});

test('decodeEntities handles named, decimal, and hex forms', () => {
  assert.equal(decodeEntities('a &amp; b &#65; &#x42; &rsquo;'), 'a & b A B ’');
  assert.equal(decodeEntities('&unknownthing;'), '&unknownthing;');
});

test('parseArticleList keeps relative essay links and drops nav pages', () => {
  const listPage = [
    '<a href="index.html">Home</a>',
    '<a href="greatwork.html">How to Do Great Work</a>',
    '<a href="https://elsewhere.example/post.html">External</a>',
    '<a href="greatwork.html">How to Do Great Work</a>',
    '<a href="ds.html">A Word to the Resourceful</a>',
    '<a href="rss.html">RSS</a>',
  ].join('\n');
  const refs = parseArticleList(listPage, 'https://paulgraham.com/articles.html');
  assert.deepEqual(
    refs.map((r) => r.slug),
    ['greatwork', 'ds'],
  );
  assert.equal(refs[0].url, 'https://paulgraham.com/greatwork.html');
  assert.equal(refs[1].title, 'A Word to the Resourceful');
});

test('parsePostLinks reads the date from the URL and dedupes', () => {
  const listing = [
    '<a href="https://blog.example.com/2014/07/07/some-post/">Some Post</a>',
    '<a href="https://blog.example.com/2014/07/07/some-post/">again</a>',
    '<a href="https://blog.example.com/2021/01/03/later-post/">Later</a>',
    '<a href="https://blog.example.com/about/">About</a>',
  ].join('\n');
  const refs = parsePostLinks(listing, 'https://blog\\.example\\.com/(\\d{4})/(\\d{2})/(\\d{2})/([a-z0-9-]+)/');
  assert.deepEqual(
    refs.map((r) => [r.slug, r.publishedAt]),
    [
      ['some-post', '2014-07-07'],
      ['later-post', '2021-01-03'],
    ],
  );
});

test('parsePostLinks prefixes relative listing links with urlPrefix', () => {
  const listing = '<a href="/blog/2016/03/30/wizard-programmer/">Wizard</a>';
  const refs = parsePostLinks(listing, '/blog/(\\d{4})/(\\d{2})/(\\d{2})/([a-z0-9-]+)/', 'https://jvns.ca');
  assert.equal(refs[0].url, 'https://jvns.ca/blog/2016/03/30/wizard-programmer/');
  assert.equal(refs[0].publishedAt, '2016-03-30');
});

test('withinLengthBand accepts near-original lengths and rejects summaries and padding', () => {
  assert.equal(withinLengthBand(1000, 1000), true);
  assert.equal(withinLengthBand(1000, 700), true);
  assert.equal(withinLengthBand(1000, 1300), true);
  assert.equal(withinLengthBand(1000, 400), false); // summarized
  assert.equal(withinLengthBand(1000, 2000), false); // padded
  assert.equal(withinLengthBand(0, 500), false); // degenerate original
  assert.equal(withinLengthBand(1000, 900, 0.95, 1.05), false); // custom band
});

test('extractMonthYearDate reads the bare month-year line PG essays open with', () => {
  assert.equal(extractMonthYearDate('The Brand Age\n\nMarch 2026\n\nIn the early 1970s...'), '2026-03-01');
  assert.equal(extractMonthYearDate('No date line here, just prose from March 2020 onward.'), null);
});
