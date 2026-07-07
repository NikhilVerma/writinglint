import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, segments } from '../src/detector/analyze.js';
import { loadParser } from '../src/detector/parser-node.js';
import type { Category, Analysis } from '../src/detector/types.js';
import type { Parser } from '../src/detector/tokens.js';

let parser: Parser;
before(async () => {
  parser = await loadParser();
});

const run = (t: string): Promise<Analysis> => analyze(t, parser);
const catsOf = async (t: string) => new Set((await run(t)).findings.map((f) => f.category));

test('dense AI prose scores high and lands in the top verdict band', async () => {
  const ai =
    "In today's world, this stands as a testament to innovation. It is important to note that it plays a pivotal role, showcasing a rich tapestry. Experts argue it is not only bold but also profound.";
  const a = await run(ai);
  assert.ok(a.stats.score >= 55, `expected high score, got ${a.stats.score}`);
  assert.match(a.stats.verdict, /AI/);
});

test('plain human prose scores low and flags ~nothing', async () => {
  const human =
    'I bought a used Corolla last spring. The transmission started slipping in July, so I took it to a shop off Route 9. It runs fine now.';
  const a = await run(human);
  assert.ok(a.stats.score < 10, `plain human over-scored: ${a.stats.score}`);
});

test('finding offsets are exact (slice equals reported text)', async () => {
  const t = 'Our platform boasts world-class support and it showcases a vibrant future.';
  for (const f of (await run(t)).findings) {
    assert.equal(t.slice(f.start, f.end), f.text, `offset mismatch for rule ${f.rule}`);
  }
});

test('structural rules fire on constructions, not fixed phrases', async () => {
  // paraphrases the detector never saw a literal string for
  const checks: [string, Category, string][] = [
    ['The museum stands as a monument to the era.', 'significance', 'copula-avoid'],
    ['Pundits contend that the market will recover.', 'vague', 'vague-attribution'],
    ['The reform boosts growth, reshaping the whole sector.', 'significance', 'participial-appendage'],
    ['The plan is not merely bold but also achievable.', 'parallelism', 'neg-parallel'],
    ['The lush, sprawling, and chaotic garden thrived.', 'rule-of-three', 'triad'],
    ['It occupies a decisive role in the outcome.', 'significance', 'light-verb-role'],
  ];
  for (const [text, cat, rule] of checks) {
    const fs = (await run(text)).findings;
    assert.ok(
      fs.some((f) => f.category === cat && f.rule === rule),
      `expected ${rule} (${cat}) for: ${text} — got ${JSON.stringify(fs.map((f) => f.rule))}`,
    );
  }
});

test('lexical AI vocabulary still fires (inherently lexical)', async () => {
  assert.ok((await catsOf('We must delve into the intricate tapestry.')).has('ai-vocab'));
});

test('segments() cover the whole text with no gaps or overlaps', async () => {
  const text = 'It stands as a testament, showcasing a rich tapestry of ideas.';
  const segs = segments(text, (await run(text)).findings);
  let cursor = 0;
  for (const s of segs) {
    assert.equal(s.start, cursor, 'segment gap/overlap');
    cursor = s.end;
  }
  assert.equal(cursor, text.length, 'segments do not cover full text');
});

test('sophisticated human vocabulary is not over-punished', async () => {
  const formal =
    'It is a curious feature of monetary history that the objects chosen to serve as money have so rarely been chosen for their usefulness. What such examples suggest is that value is a convention.';
  assert.ok((await run(formal)).stats.score < 20, `formal human over-punished: ${(await run(formal)).stats.score}`);
});
