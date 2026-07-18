import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Linter, resolveConfig, type Lint, type ResolvedConfig } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { score, strict } from '../src/index.js';

let linter: Linter;
let config: ResolvedConfig;

before(async () => {
  linter = new Linter(await loadParser());
  config = resolveConfig(strict);
});

async function lint(text: string): Promise<Lint[]> {
  return (await linter.lint(text, config)).lints;
}
const fired = (lints: Lint[], rule: string) => lints.some((l) => l.ruleId === `ai-style/${rule}`);
const finding = (lints: Lint[], rule: string) => lints.find((l) => l.ruleId === `ai-style/${rule}`);

test('corrective-antithesis fires on the "X, not Y" construction', async () => {
  const repeated = await lint('Trust the flags, not the number. The prompt is a request, not a contract.');
  assert.ok(fired(repeated, 'corrective-antithesis'));
  assert.equal(
    finding(await lint('It checks the writing, not who wrote it.'), 'corrective-antithesis')?.confidence,
    'low',
  );
  assert.equal(
    finding(
      await lint('A prior sentence changes the parser batch. It checks the writing, not who wrote it.'),
      'corrective-antithesis',
    )?.confidence,
    'low',
  );
});

test('stepwise sequencing catches formulaic “X then Y” cadence', async () => {
  assert.equal(
    finding(
      await lint('Deterministic rules then flag canned arguments, unsupported claims, and filler.'),
      'stepwise-sequencing',
    )?.confidence,
    'low',
  );
  const repeated = await lint(
    'The parser then maps how the words relate. The rules then flag canned arguments and filler.',
  );
  assert.equal(finding(repeated, 'stepwise-sequencing')?.confidence, 'medium');
});

test('stepwise sequencing leaves ordinary instructions and chronology alone', async () => {
  assert.ok(!fired(await lint('Run the migration, then deploy the worker.'), 'stepwise-sequencing'));
  assert.ok(!fired(await lint('She finished lunch, then returned to work.'), 'stepwise-sequencing'));
  assert.ok(!fired(await lint('If the test passes, then deploy the worker.'), 'stepwise-sequencing'));
});

test('stepwise sequencing tolerates a compact-parser predicate mistag', async () => {
  const parser = {
    async parse() {
      return [{
        text: 'Rules then flag claims.', start: 0, end: 22,
        tokens: [
          { id: 1, form: 'Rules', lemma: 'rules', upos: 'NOUN', head: 4, deprel: 'nsubj', start: 0, end: 5 },
          { id: 2, form: 'then', lemma: 'then', upos: 'PART', head: 4, deprel: 'advmod', start: 6, end: 10 },
          { id: 3, form: 'flag', lemma: 'flag', upos: 'NOUN', head: 4, deprel: 'compound', start: 11, end: 15 },
          { id: 4, form: 'claims', lemma: 'claim', upos: 'NOUN', head: 0, deprel: 'root', start: 16, end: 22 },
        ],
      }];
    },
  };
  const variantLinter = new Linter(parser);
  const result = await variantLinter.lint('Rules then flag claims.', config);
  assert.equal(finding(result.lints, 'stepwise-sequencing')?.confidence, 'low');
});

test('corrective-antithesis does NOT fire on plain sentential negation', async () => {
  assert.ok(!fired(await lint('I did not see the number on the screen.'), 'corrective-antithesis'));
  assert.ok(!fired(await lint('She was not at home yesterday.'), 'corrective-antithesis'));
  assert.ok(!fired(await lint('Return direct children only, not the whole subtree.'), 'corrective-antithesis'));
  assert.ok(!fired(await lint('Use titles in the enum, not UUIDs.'), 'corrective-antithesis'));
  assert.equal(finding(await lint('The prompt is a request, not a contract.'), 'corrective-antithesis')?.confidence, 'low');
});

test('negative contrast catches a staged two-sentence redefinition', async () => {
  assert.equal(
    finding(await lint("Controls are not documents. They're commitments."), 'negative-contrast')?.confidence,
    'medium',
  );
  assert.equal(
    finding(await lint("A strategy isn't a slogan. It's a sequence of choices."), 'negative-contrast')?.confidence,
    'medium',
  );
  assert.ok(!fired(await lint('Controls are not documents stored in this directory.'), 'negative-contrast'));
});

test('dramatic fragments are graded without matching ordinary transitions', async () => {
  assert.equal(finding(await lint('The old workflow required a manual review. Until now. The new job automates it.'), 'dramatic-fragment')?.confidence, 'medium');
  assert.equal(finding(await lint('The team repeated that process. For years. The new job automates it.'), 'dramatic-fragment')?.confidence, 'low');
  assert.ok(!fired(await lint('Until now, the workflow required a manual review.'), 'dramatic-fragment'));
});

test('a few structural + lexical rules still fire on their canonical tells', async () => {
  assert.ok(fired(await lint('The design is not only fast but also elegant.'), 'negative-parallelism'));
  assert.ok(fired(await lint('The city was vibrant, bustling, and diverse.'), 'rule-of-three'));
  assert.equal(
    finding(
      await lint('At Stance we consume models, we don’t train them, and customers bring their own.'),
      'rule-of-three',
    )?.confidence,
    'low',
  );
  assert.ok(!fired(await lint('At Stance we build, test, and deploy models.'), 'rule-of-three'));
  assert.ok(fired(await lint('Moreover, the results were clear.'), 'opening-conjunction'));
});

test('hedging-seesaw fires on relentless sentence-initial balancing', async () => {
  const lints = await lint(
    'While the tool is fast, it struggles with scale. However, the benchmarks look promising. ' +
      'Although critics remain wary, adoption keeps growing. That said, the risks are real. ' +
      'The market will decide the winner soon.',
  );
  assert.ok(fired(lints, 'hedging-seesaw'));
});

test('hedging-seesaw does NOT fire on a single ordinary concession', async () => {
  const lints = await lint('While I was cooking, the phone rang. The rest of the evening was quiet.');
  assert.ok(!fired(lints, 'hedging-seesaw'));
});

test('score() returns a 0–100 number with a verdict', async () => {
  const { doc, lints } = await linter.lint('In today’s world, this stands as a testament to innovation.', config);
  const s = score(doc, lints);
  assert.equal(typeof s.score, 'number');
  assert.ok(s.score >= 0 && s.score <= 100);
  assert.ok(typeof s.verdict === 'string' && s.verdict.length > 0);
});

test('passive actor hiding grades ordinary passives below accountability-hiding passives', async () => {
  assert.equal(finding(await lint('The deadline was changed yesterday.'), 'passive-actor-hiding')?.confidence, 'medium');
  assert.ok(!fired(await lint('The deadline was changed by the client yesterday.'), 'passive-actor-hiding'));
  assert.equal(finding(await lint('The control framework is documented.'), 'passive-actor-hiding')?.confidence, 'low');
  assert.equal(finding(await lint('Weinre can be installed using npm.'), 'passive-actor-hiding')?.confidence, 'low');
  assert.equal(finding(await lint('Which user paths will be the most traveled?'), 'passive-actor-hiding')?.confidence, 'low');
  assert.equal(finding(await lint('Several safety concerns were ignored.'), 'passive-actor-hiding')?.confidence, 'medium');
  assert.equal(finding(await lint('The unused vocabulary has been removed.'), 'passive-actor-hiding')?.confidence, 'low');
  assert.ok(!fired(await lint('It is made up half the time.'), 'passive-actor-hiding'));
});

test('weak candidates are retained as info and promoted by repetition or density', async () => {
  assert.equal(finding(await lint('The method is intricate.'), 'ai-vocabulary')?.confidence, 'low');
  assert.equal(finding(await lint('Clearly this always works.'), 'unsupported-certainty')?.confidence, 'low');
  const absolutes = await lint('Everything always works and nothing can ever fail.');
  assert.equal(finding(absolutes, 'absolute-claim')?.confidence, 'medium');
  assert.equal(finding(await lint('This is the fastest approach.'), 'unsupported-comparison')?.confidence, 'medium');
  assert.ok(!fired(await lint('People who think clearly and write clearly do better work.'), 'unsupported-certainty'));
});

test('emerging slop phrases are informational and preserve literal construction language', async () => {
  assert.equal(
    finding(await lint('The real bottleneck is not compute. It is organizational courage.'), 'emerging-slop-phrases')?.confidence,
    'low',
  );
  assert.equal(
    finding(await lint('This is the load-bearing idea in the entire strategy.'), 'emerging-slop-phrases')?.confidence,
    'low',
  );
  assert.ok(!fired(await lint('The engineer replaced a damaged load-bearing wall.'), 'emerging-slop-phrases'));
});

test('mechanical outline and cross-rule paragraph clusters combine distributed evidence', async () => {
  const text = [
    '**Why this works:** Clearly, this approach always delivers robust results.',
    '',
    '**When to use it:** Obviously, this strategy never creates failures.',
    '',
    '**The key trick:** This method is crucial, vibrant, and groundbreaking.',
  ].join('\n');
  const lints = await lint(text);
  assert.equal(finding(lints, 'mechanical-outline')?.confidence, 'medium');
  assert.ok(fired(lints, 'evidence-cluster'));
});

test('formatting repetition and support-only signals cannot certify prose by themselves', async () => {
  const separators = await lint('---\n\n## Technique One\n\nText.\n\n---\n\n## Technique Two\n\nText.\n\n---\n\n## Technique Three\n\nText.');
  assert.equal(finding(separators, 'mechanical-outline')?.confidence, 'low');

  const checklist = await lint([
    '- **Planning:** write the request.',
    '- **Requirements:** review what gets built.',
    '- **Implementation:** document why, never what.',
    '- **Testing:** test the parser.',
    '- **Deployment:** use a flag.',
    '- **Maintenance:** log the calls.',
  ].join('\n'));
  assert.equal(finding(checklist, 'mechanical-outline')?.confidence, 'low');
  assert.notEqual(finding(checklist, 'evidence-cluster')?.confidence, 'high');
});

test('nearby repeated paragraphs emit a semantic redundancy candidate', async () => {
  const text = [
    'The registry replaces raw database identifiers with short references that the model can safely return.',
    '',
    'Short references replace raw database identifiers, allowing the model to return safe registry values.',
  ].join('\n');
  assert.ok(fired(await lint(text), 'semantic-redundancy'));

  const recipe = await lint([
    '- Select the layer named Land.',
    '- Open the Render menu.',
    '- Apply the Clouds filter.',
    '- Set the layer opacity to 50.',
    '',
    '- Select the layer named Clouds.',
    '- Open the Render menu.',
    '- Apply the Difference Clouds filter.',
    '- Set the layer opacity to 60.',
  ].join('\n'));
  assert.equal(finding(recipe, 'semantic-redundancy')?.confidence, 'low');
});

test('false agency is narrow and asks for the human interpreter', async () => {
  assert.ok(fired(await lint('The data tells us which option to choose.'), 'false-agency'));
  assert.equal(finding(await lint('The complaint becomes a fix.'), 'false-agency')?.confidence, 'medium');
  assert.equal(finding(await lint('The feedback evolves into a strategy.'), 'false-agency')?.confidence, 'medium');
  assert.equal(finding(await lint('The decision emerges.'), 'false-agency')?.confidence, 'low');
  assert.ok(!fired(await lint('The analyst tells us which option to choose.'), 'false-agency'));
  assert.ok(!fired(await lint('The caterpillar becomes a butterfly.'), 'false-agency'));
  assert.ok(!fired(await lint('The “superficial analysis” tell appears in this example.'), 'false-agency'));
});

test('rhetorical scaffolding catches canned setup but not a direct claim', async () => {
  assert.ok(fired(await lint("Here's what I mean: the second test failed."), 'rhetorical-scaffolding'));
  assert.ok(!fired(await lint('The second test failed.'), 'rhetorical-scaffolding'));
});

test('negative listing requires a repeated run', async () => {
  assert.ok(fired(await lint("It wasn't speed. It wasn't cost. It was trust."), 'negative-list-buildup'));
  assert.ok(!fired(await lint("It wasn't speed. The bottleneck was memory."), 'negative-list-buildup'));
});

test('modal redundancy removes only the duplicated future modal', async () => {
  assert.ok(fired(
    await lint('You can rewrite every line or hire an editor; both will give you a cleaner draft.'),
    'modal-redundancy',
  ));
  assert.ok(!fired(
    await lint('You can rewrite every line or hire an editor; both give you a cleaner draft.'),
    'modal-redundancy',
  ));
});
