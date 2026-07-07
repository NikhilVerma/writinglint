import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedSentence, DepToken } from 'nlpgraph';
import {
  Linter,
  defineRule,
  definePack,
  defineConfig,
  resolveConfig,
  segments,
  type Parser,
} from '../src/index.js';

// ── a fake parser: one hand-built sentence, ASCII so byte offset == char offset ─
function tok(id: number, form: string, upos: string, head: number, deprel: string, start: number): DepToken {
  return { id, form, upos, head, deprel, start, end: start + form.length } as DepToken;
}
// "the cat sat" — det(the→cat) nsubj(cat→sat) root(sat)
const SENTENCE: ParsedSentence = {
  text: 'the cat sat',
  start: 0,
  end: 11,
  tokens: [tok(1, 'the', 'DET', 2, 'det', 0), tok(2, 'cat', 'NOUN', 3, 'nsubj', 4), tok(3, 'sat', 'VERB', 0, 'root', 8)],
} as ParsedSentence;

const fakeParser: Parser = { parse: async () => [SENTENCE] };

// A trivial rule: flag every NOUN token.
const flagNouns = defineRule({
  meta: { name: 'flag-nouns', category: 'demo', docs: { description: 'Flags nouns.' } },
  create(ctx) {
    return {
      Token(t) {
        if (t.upos === 'NOUN') ctx.report({ span: { start: t.start, end: t.end }, message: 'a noun' });
      },
    };
  },
});

const demoPack = definePack({
  name: 'demo',
  rules: { 'flag-nouns': flagNouns },
  categories: { demo: { id: 'demo', label: 'Demo', blurb: 'test rules' } },
  configs: { recommended: { rules: { 'demo/flag-nouns': 'warn' } } },
});

test('resolveConfig enables rules, honours off, and merges categories', () => {
  const cfg = defineConfig({
    plugins: { demo: demoPack },
    extends: [demoPack.configs!.recommended],
    rules: {},
  });
  const resolved = resolveConfig(cfg);
  assert.equal(resolved.rules.size, 1);
  assert.equal(resolved.rules.get('demo/flag-nouns')?.severity, 'warn');
  assert.equal(resolved.categories.demo?.label, 'Demo');

  // A later `off` disables an extended rule.
  const off = resolveConfig(
    defineConfig({ plugins: { demo: demoPack }, extends: [demoPack.configs!.recommended], rules: { 'demo/flag-nouns': 'off' } }),
  );
  assert.equal(off.rules.size, 0);
});

test('Linter runs rules over the document and reports exact spans', async () => {
  const linter = new Linter(fakeParser);
  const { lints } = await linter.lint(
    'the cat sat',
    defineConfig({ plugins: { demo: demoPack }, extends: [demoPack.configs!.recommended] }),
  );
  assert.equal(lints.length, 1);
  assert.equal(lints[0].ruleId, 'demo/flag-nouns');
  assert.equal(lints[0].text, 'cat');
  assert.equal(lints[0].start, 4);
  assert.equal(lints[0].end, 7);
});

test('segments flattens lints into non-overlapping slices', async () => {
  const linter = new Linter(fakeParser);
  const { lints } = await linter.lint('the cat sat', { plugins: { demo: demoPack }, extends: [demoPack.configs!.recommended] });
  const segs = segments('the cat sat', lints);
  // plain "the ", lint "cat", plain " sat"
  assert.equal(segs.length, 3);
  assert.equal(segs[1].lint?.text, 'cat');
  assert.equal(segs.map((s) => 'the cat sat'.slice(s.start, s.end)).join(''), 'the cat sat');
});
