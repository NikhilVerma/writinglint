import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Linter,
  defineRule,
  definePack,
  defineConfig,
  resolveConfig,
  segments,
  type Parser,
  type ParsedSentence,
  type DepToken,
  InMemoryTerminologyProvider,
  LayeredTerminologyProvider,
  countSentenceUnits,
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
  assert.equal(lints[0].confidence, 'medium');
});

test('auto severity follows per-finding confidence and minimumSeverity filters output', async () => {
  const confidenceRule = defineRule({
    meta: { name: 'confidence', category: 'demo', docs: { description: 'Confidence test.' }, defaultConfidence: 'low' },
    create(ctx) {
      return { Document() {
        ctx.report({ span: { start: 0, end: 3 }, message: 'low' });
        ctx.report({ span: { start: 4, end: 7 }, message: 'high', confidence: 'high' });
      } };
    },
  });
  const pack = definePack({ name: 'confidence', rules: { check: confidenceRule } });
  const config = defineConfig({ plugins: { confidence: pack }, rules: { 'confidence/check': 'auto' }, minimumSeverity: 'warn' });
  const { lints } = await new Linter(fakeParser).lint('the cat sat', config);
  assert.deepEqual(lints.map(({ severity, confidence }) => ({ severity, confidence })), [
    { severity: 'error', confidence: 'high' },
  ]);
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

test('Document exposes blank-line paragraphs for cross-sentence rules', async () => {
  const parser: Parser = { parse: async () => [
    { ...SENTENCE, start: 0, end: 11 },
    { ...SENTENCE, text: 'the dog ran', start: 13, end: 24, tokens: [
      tok(1, 'the', 'DET', 2, 'det', 13), tok(2, 'dog', 'NOUN', 3, 'nsubj', 17), tok(3, 'ran', 'VERB', 0, 'root', 21),
    ] },
  ] };
  const { doc } = await new Linter(parser).lint('the cat sat\n\nthe dog ran', defineConfig({}));
  assert.equal(doc.paragraphs.length, 2);
  assert.deepEqual(doc.paragraphs.map((paragraph) => paragraph.text), ['the cat sat', 'the dog ran']);
});

test('core composes structure, annotations, parser capabilities, services, and evidence', async () => {
  const text = 'Install 10 kg.';
  const parser: Parser = {
    descriptor: {
      id: 'test/morphology-parser',
      version: '1',
      languages: ['en'],
      capabilities: ['sentence-boundaries', 'tokens', 'part-of-speech', 'dependencies', 'morphology'],
    },
    parse: async () => [{
      text,
      start: 0,
      end: text.length,
      tokens: [
        { ...tok(1, 'Install', 'VERB', 0, 'root', 0), features: { Mood: 'Imp' } },
        tok(2, '10', 'NUM', 3, 'nummod', 8),
        tok(3, 'kg', 'NOUN', 1, 'obj', 11),
        tok(4, '.', 'PUNCT', 1, 'punct', 13),
      ],
    }],
  };
  const terminology = new InMemoryTerminologyProvider({
    id: 'test-terms', layer: 'project', languages: ['en'],
  }, [{
    id: 'install', term: 'install', status: 'approved', language: 'en',
    provenance: { source: 'test' },
  }]);
  let regionVisits = 0;
  let annotationVisits = 0;
  const capable = defineRule({
    meta: {
      name: 'capable',
      category: 'demo',
      docs: { description: 'Exercises the generic extension contracts.' },
      requires: {
        parser: ['morphology'],
        regions: ['step'],
        annotations: ['measurement'],
        services: ['terminology'],
      },
    },
    create(ctx) {
      return {
        Region(region) { if (region.role === 'step') regionVisits++; },
        Annotation(annotation) { if (annotation.kind === 'measurement') annotationVisits++; },
        DocumentExit() {
          const match = ctx.services.terminology?.lookup('Install', { language: ctx.doc.language })[0];
          ctx.report({
            span: { start: 0, end: 7 },
            message: 'generic contracts available',
            evidence: [{ kind: 'terminology-match', data: { provider: match?.providerId ?? '' } }],
          });
        },
      };
    },
  });
  const pack = definePack({ name: 'capabilities', rules: { capable } });
  const report = await new Linter(parser).lint(text, defineConfig({
    plugins: { capabilities: pack }, rules: { 'capabilities/capable': 'warn' },
  }), {
    regions: [
      { id: 'document', role: 'document', start: 0, end: text.length },
      { id: 'step', role: 'step', start: 0, end: text.length, parentId: 'document', mode: 'procedural' },
    ],
    annotations: [{ kind: 'measurement', start: 8, end: 13, provider: 'test-recognizer' }],
    services: { terminology },
  });

  assert.equal(report.executions[0]?.status, 'executed');
  assert.equal(report.doc.parser.id, 'test/morphology-parser');
  assert.equal(report.doc.tokens[0]?.features?.Mood, 'Imp');
  assert.equal(regionVisits, 1);
  assert.equal(annotationVisits, 1);
  assert.equal(report.lints[0]?.evidence?.[0]?.data?.provider, 'test-terms');
  assert.deepEqual(
    countSentenceUnits(report.doc.sentences[0]!, report.doc, {
      id: 'measurement-count', groupAnnotationKinds: ['measurement'],
    }).map(({ text: unitText }) => unitText),
    ['Install', '10 kg'],
  );
});

test('rules are explicitly skipped when a required parser capability is unavailable', async () => {
  const requiresMorphology = defineRule({
    meta: {
      name: 'requires-morphology', category: 'demo',
      docs: { description: 'Needs morphology.' },
      requires: { parser: ['morphology'] },
    },
    create(ctx) {
      return { Document() { ctx.report({ span: { start: 0, end: 3 }, message: 'must not run' }); } };
    },
  });
  const pack = definePack({ name: 'requirements', rules: { check: requiresMorphology } });
  const report = await new Linter(fakeParser).lint('the cat sat', defineConfig({
    plugins: { requirements: pack }, rules: { 'requirements/check': 'warn' },
  }));
  assert.equal(report.lints.length, 0);
  assert.deepEqual(report.executions, [{
    ruleId: 'requirements/check',
    status: 'skipped',
    reason: 'Parser capabilities unavailable: morphology.',
  }]);
});

test('layered terminology lets a local glossary override a standard', () => {
  const standard = new InMemoryTerminologyProvider({
    id: 'standard', layer: 'standard', languages: ['en'],
  }, [{
    id: 'standard-utilize', term: 'utilize', status: 'unapproved', language: 'en',
    provenance: { source: 'standard' },
  }]);
  const project = new InMemoryTerminologyProvider({
    id: 'project', layer: 'project', languages: ['en'],
  }, [{
    id: 'project-utilize', term: 'utilize', status: 'technical', language: 'en',
    provenance: { source: 'project glossary' },
  }]);
  const layered = new LayeredTerminologyProvider([standard, project]);
  assert.deepEqual(layered.lookup('UTILIZE').map(({ providerId, record }) => ({ providerId, status: record.status })), [
    { providerId: 'project', status: 'technical' },
  ]);
});

test('structured inputs reject invalid UTF-16 ranges and missing parents', async () => {
  await assert.rejects(
    new Linter({ parse: async () => [] }).lint('😀', defineConfig({}), {
      regions: [{ id: 'bad', role: 'paragraph', start: 0, end: 3 }],
    }),
    /invalid UTF-16 source range/,
  );
  await assert.rejects(
    new Linter({ parse: async () => [] }).lint('text', defineConfig({}), {
      regions: [{ id: 'child', role: 'paragraph', start: 0, end: 4, parentId: 'missing' }],
    }),
    /missing parent/,
  );
});
