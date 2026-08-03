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

test('repeated sentence frames are detected across a paragraph without flagging varied exposition', async () => {
  const repeated = await lint([
    'Each request enters through the same gateway.',
    'Each request passes through the same policy check.',
    'Each request moves through the same approval queue.',
    'Each request leaves with the same audit record.',
  ].join(' '));
  assert.equal(finding(repeated, 'repeated-sentence-frame')?.confidence, 'medium');

  const varied = await lint([
    'The gateway accepts a request.',
    'Policy checks run next.',
    'A reviewer can approve the result or send it back.',
    'The audit log records what happened at the end.',
  ].join(' '));
  assert.ok(!fired(varied, 'repeated-sentence-frame'));
});

test('repeated sentence frames leave procedural lists alone', async () => {
  const checklist = await lint([
    '- Each request enters through the gateway.',
    '- Each request passes through the policy check.',
    '- Each request moves through the approval queue.',
    '- Each request leaves with an audit record.',
  ].join('\n'));
  assert.ok(!fired(checklist, 'repeated-sentence-frame'));
});

test('repeated transitions are promoted only when they become a document habit', async () => {
  const repeated = await lint([
    'Moreover, the cache keeps recent records nearby.',
    'Furthermore, the worker batches related writes.',
    'Additionally, the queue limits concurrent jobs.',
    'Ultimately, the operator can inspect every retry.',
  ].join(' '));
  const transitions = repeated.filter((item) => item.ruleId === 'ai-style/opening-conjunction');
  assert.equal(transitions.length, 4);
  assert.ok(transitions.every((item) => item.confidence === 'medium'));

  assert.equal(
    finding(await lint('Moreover, the cache keeps recent records nearby. The worker batches writes.'), 'opening-conjunction')?.confidence,
    'low',
  );
});

test('formulaic transitions stay informational when scattered through a long document', async () => {
  const scattered = await lint([
    'Moreover, the cache keeps recent records nearby.',
    'The worker batches related writes.',
    'Operators can inspect the queue.',
    'Retries use a fixed delay.',
    'The log stores each attempt.',
    'Policy checks happen before dispatch.',
    'Furthermore, the dashboard groups failures by cause.',
    'Reviewers can open the original request.',
    'A separate job removes expired records.',
    'Metrics are sampled once per minute.',
    'Alerts go to the owning team.',
    'The runbook explains how to recover a stalled worker.',
    'Additionally, the export includes the final disposition.',
  ].join(' '));
  const transitions = scattered.filter((item) => item.ruleId === 'ai-style/opening-conjunction');
  assert.equal(transitions.length, 3);
  assert.ok(transitions.every((item) => item.confidence === 'low'));
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

test('em-dash overuse distinguishes an isolated dash from a local cluster', async () => {
  const isolated = await lint('The reviewer changed one phrase — the rest of the draft stayed as written.');
  assert.equal(finding(isolated, 'em-dash-overuse')?.confidence, 'low');

  const belowThreshold = await lint([
    'The first record changed — the reviewer explained why.',
    'The second record changed — the reviewer explained why.',
    'The third record changed — the reviewer explained why.',
    'The fourth record stayed as written.',
    'The fifth record stayed as written.',
    'The sixth record stayed as written.',
    'The seventh record stayed as written.',
    'The eighth record stayed as written.',
  ].join(' '));
  assert.equal(finding(belowThreshold, 'em-dash-overuse')?.confidence, 'low');

  const clustered = await lint([
    'The first record changed — the reviewer explained why.',
    'The second record changed — the reviewer explained why.',
    'The third record changed — the reviewer explained why.',
    'The fourth record changed — the reviewer explained why.',
    'The fifth record stayed as written.',
    'The sixth record stayed as written.',
    'The seventh record stayed as written.',
    'The eighth record stayed as written.',
  ].join(' '));
  assert.equal(finding(clustered, 'em-dash-overuse')?.confidence, 'medium');
});

test('em-dash clusters cannot be diluted by unrelated prose elsewhere in the document', async () => {
  const cluster = [
    'The first record changed — the reviewer explained why.',
    'The second record changed — the reviewer explained why.',
    'The third record changed — the reviewer explained why.',
    'The fourth record changed — the reviewer explained why.',
    'The fifth record stayed as written.',
    'The sixth record stayed as written.',
    'The seventh record stayed as written.',
    'The eighth record stayed as written.',
  ];
  const padding = Array.from(
    { length: 32 },
    (_, index) => `Appendix entry ${index + 1} records an ordinary review decision.`,
  );
  const result = finding(await lint([...cluster, ...padding].join(' ')), 'em-dash-overuse');
  assert.equal(result?.confidence, 'medium');
  assert.match(result?.message ?? '', /4 in 8 consecutive sentences/);
});

test('em-dash overuse also recognizes a dispersed whole-document habit', async () => {
  // Interleave the dash-bearing sentences so no eight-sentence window can
  // independently qualify as a local cluster.
  const dispersedDocument = (dashCount: number, sentenceCount: number) => {
    const dashAt = new Set(Array.from(
      { length: dashCount },
      (_, index) => Math.floor(index * sentenceCount / dashCount),
    ));
    return Array.from(
      { length: sentenceCount },
      (_, index) => dashAt.has(index)
        ? `Section ${index + 1} records a change — an editor supplied the reason.`
        : `Section ${index + 1} records an ordinary review decision.`,
    ).join(' ');
  };

  assert.equal(
    finding(await lint(dispersedDocument(12, 120)), 'em-dash-overuse')?.confidence,
    'medium',
  );
  assert.equal(
    finding(await lint(dispersedDocument(11, 120)), 'em-dash-overuse')?.confidence,
    'low',
  );
  assert.equal(
    finding(await lint(dispersedDocument(12, 200)), 'em-dash-overuse')?.confidence,
    'low',
  );
  assert.ok(!fired(await lint('The range is 10–20 pages and the slug is draft-ready.'), 'em-dash-overuse'));
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

test('semantic repetition distinguishes a recycled claim from new measurements', async () => {
  const recycled = await lint([
    'The new cache reduces median response time because it keeps frequently requested records in memory.',
    '',
    'Keeping frequently requested records in memory is how the new cache reduces median response time.',
  ].join('\n'));
  assert.equal(finding(recycled, 'semantic-redundancy')?.confidence, 'medium');

  const supported = await lint([
    'The new cache reduces median response time because it keeps frequently requested records in memory.',
    '',
    'In our May benchmark of 4,000 frequently requested records, the new cache reduced median response time from 180 milliseconds to 92 milliseconds.',
  ].join('\n'));
  assert.ok(!fired(supported, 'semantic-redundancy'));
});

test('a concrete example can advance a repeated argument without a number', async () => {
  const withExample = await lint([
    'The registry replaces raw database identifiers with short references that the model can safely return.',
    '',
    'For example, a model can return customer-one instead of exposing the raw database identifier for that account.',
  ].join('\n'));
  assert.ok(!fired(withExample, 'semantic-redundancy'));
});

test('semantic repetition can find a recycled argument inside one paragraph', async () => {
  const recycled = await lint([
    'The shared queue gives every reviewer the same view of pending requests.',
    'A reviewer can still filter the queue by owner or deadline.',
    'Every reviewer sees the same pending requests because the queue is shared.',
  ].join(' '));
  assert.equal(finding(recycled, 'semantic-redundancy')?.confidence, 'medium');

  const advanced = await lint([
    'The shared queue gives every reviewer the same view of pending requests.',
    'A reviewer can still filter the queue by owner or deadline.',
    'For example, the support team filters overdue requests before its morning handoff.',
  ].join(' '));
  assert.ok(!fired(advanced, 'semantic-redundancy'));
});

test('semantic overlap does not promote corrections or concrete mechanisms', async () => {
  const correction = await lint([
    'With every natural number you can relate at least one real number, so the set of real numbers has greater cardinality than the set of natural numbers.',
    'That statement establishes the mapping in only one direction.',
    "What it is n't true is that you can relate every real number with a natural number.",
  ].join(' '));
  assert.ok(!fired(correction, 'semantic-redundancy'));

  const mechanism = await lint([
    'The team thinks the old code is a mess.',
    'They propose replacing it instead of reading it.',
    'The team thinks the old code is a mess because unfamiliar code is harder to understand.',
  ].join(' '));
  assert.ok(!fired(mechanism, 'semantic-redundancy'));

  const workedExample = await lint([
    'Yellow paint absorbs blue light and reflects red and green.',
    'Red paint absorbs green and blue light and reflects red.',
    'Mix them together and the paint absorbs blue, absorbs half the green, and reflects the rest.',
  ].join(' '));
  assert.notEqual(finding(workedExample, 'semantic-redundancy')?.confidence, 'medium');
});

test('alternating paragraph templates count as uniform structure', async () => {
  const templated = await lint([
    'The intake service accepts a request and assigns it to the correct queue. The queue stays visible.',
    '',
    'The policy service checks the request and records the applicable constraints. The decision stays visible.',
    '',
    'The review service sends the request and records the assigned reviewer. The reviewer stays visible.',
    '',
    'The audit service stores the decision and records the final timestamp. The history stays visible.',
  ].join('\n'));
  assert.equal(finding(templated, 'uniform-rhythm')?.confidence, 'medium');

  const varied = await lint([
    'The gateway accepts requests and records their source.',
    '',
    'Policy checks run next. Some finish immediately, while unusual requests wait for a reviewer.',
    '',
    'A reviewer can approve the result, return it with a note, or ask the requester for more context. The queue records that choice. Nothing else runs until the response arrives.',
    '',
    'At the end, the audit log stores the decision.',
  ].join('\n'));
  assert.ok(!fired(varied, 'uniform-rhythm'));
});

test('uniform structure ignores repeated list-item shapes', async () => {
  const list = await lint([
    '- The gateway accepts a request. The source is recorded.',
    '',
    '- The policy service checks the request. The result is recorded.',
    '',
    '- The reviewer opens the request. The decision is recorded.',
    '',
    '- The audit service closes the request. The timestamp is recorded.',
  ].join('\n'));
  assert.ok(!fired(list, 'uniform-rhythm'));
});

test('dense outcome claims require support somewhere in the paragraph', async () => {
  const unsupported = await lint([
    'The new workflow improves reliability.',
    'It reduces review time.',
    'It prevents expensive mistakes.',
    'It makes every release safer.',
  ].join(' '));
  assert.equal(finding(unsupported, 'claim-evidence-gap')?.confidence, 'medium');

  const supported = await lint([
    'We tested the workflow on 240 pull requests in June.',
    'Median review time fell from 18 minutes to 11 minutes, and failed releases dropped from 9 to 3.',
    'The raw logs and test script are linked in the appendix.',
  ].join(' '));
  assert.ok(!fired(supported, 'claim-evidence-gap'));
});

test('claim-evidence confidence rises with the size of the unsupported stack', async () => {
  const threeClaims = await lint([
    'The new workflow improves reliability.',
    'It reduces review time.',
    'It prevents expensive mistakes.',
  ].join(' '));
  assert.equal(finding(threeClaims, 'claim-evidence-gap')?.confidence, 'low');
});

test('dense outcome language is supported by an explicit mechanism', async () => {
  const mechanism = await lint([
    'The queue reduces duplicate work because it assigns one owner to each request.',
    'It prevents concurrent edits by locking the record while that owner works.',
    'It makes recovery safer by retaining the previous version until the replacement commits.',
  ].join(' '));
  assert.ok(!fired(mechanism, 'claim-evidence-gap'));
});

test('claim-evidence gaps can accumulate across short paragraphs', async () => {
  const distributed = await lint([
    'The shared workspace makes reviews faster.',
    '',
    'Automatic routing reduces duplicate work.',
    '',
    'Version history prevents expensive mistakes.',
    '',
    'Clear ownership makes every release safer.',
  ].join('\n'));
  assert.equal(finding(distributed, 'claim-evidence-gap')?.confidence, 'medium');

  const supported = await lint([
    'In a June trial of 240 changes, the shared workspace reduced median review time from 18 minutes to 11.',
    '',
    'Automatic routing reduced duplicate work because it assigns each change to one reviewer.',
    '',
    'Version history prevented 3 mistaken overwrites during the trial.',
    '',
    'The linked logs show which owner approved each of the 240 releases.',
  ].join('\n'));
  assert.ok(!fired(supported, 'claim-evidence-gap'));
});

test('one measured feature does not support unrelated promotional claims', async () => {
  const mixed = await lint([
    'The battery lasts 24 hours in our playback test.',
    'The headphones deliver an immersive experience.',
    'Noise cancellation makes every commute easier.',
    'The lightweight frame keeps you comfortable.',
    'Their balanced sound elevates your everyday listening.',
  ].join(' '));
  assert.equal(finding(mixed, 'claim-evidence-gap')?.confidence, 'medium');
});

test('ordinary uses of make and better do not become outcome claims', async () => {
  const mistakes = await lint([
    'Netscape made the mistake of rewriting the code.',
    'Borland made the same mistake with its database.',
    'Microsoft almost made that mistake with Word.',
    'The abandoned projects made expensive cautionary examples.',
  ].join(' '));
  assert.ok(!fired(mistakes, 'claim-evidence-gap'));

  const advice = await lint([
    'It is better not to block the narrow street.',
    'It is better not to carry the boxes side by side.',
    'It is better not to stop in the doorway.',
    'It is better not to leave a cart on the pavement.',
  ].join(' '));
  assert.ok(!fired(advice, 'claim-evidence-gap'));
});

test('compressed explanations expose their missing subjects and staged closure', async () => {
  const original = await lint([
    'We picked a rule and kept it to ourselves. Then we fed it sixty numbers and wrote down what came out the other side. Those sixty pairs are everything the machine gets. It never sees the rule.',
    '',
    'The machine is about as simple as a machine can be. It has two knobs. It takes the number you give it, multiplies by whatever the first knob says, then adds whatever the second knob says. That\'s the whole machine. Set the knobs to the right pair of numbers and it copies our secret rule exactly; set them wrong and it talks nonsense.',
    '',
    'So the question "can it find the rule?" turns into something much more concrete: can it find the right two numbers?',
  ].join('\n'));

  assert.equal(finding(original, 'referential-compression')?.confidence, 'low');
  assert.equal(finding(original, 'premature-closure')?.confidence, 'medium');
  assert.equal(finding(original, 'binary-outcome-frame')?.confidence, 'medium');
  assert.equal(finding(original, 'undefined-key-term')?.confidence, 'low');
});

test('a more explicit explanation avoids compact AI cadence but still owns an undefined term', async () => {
  const rewrite = await lint([
    'For this test we will pick a rule and keep it to ourselves. We will then try and pick sixty random numbers and write down what comes to the other side. The machine which will "guess" these rules only sees the numbers we feed it, it\'s not allowed to look at the rules (that\'s cheating).',
    '',
    'For a start we will give the machine just 2 knobs. Each knob will hold some number. The machine will take the number we will provide it, then it will multiply it by the first knob\'s value and ADD the second knob\'s value.',
    '',
    'If we set the knob values correctly, it might be able to guess our rule! And if the values are wrong it will fail.',
    '',
    'Now the goal for today\'s problem is: can we do something that will allow the machine to guess our rule by just looking at the numbers?',
  ].join('\n'));

  assert.ok(!fired(rewrite, 'referential-compression'));
  assert.ok(!fired(rewrite, 'premature-closure'));
  assert.ok(!fired(rewrite, 'binary-outcome-frame'));
  assert.equal(finding(rewrite, 'undefined-key-term')?.confidence, 'low');
});

test('contextual compression rules leave ordinary pronouns, summaries, and configuration prose alone', async () => {
  const ordinary = await lint([
    'The parser reads one sentence at a time. It stores the tokens in source order. The dependency graph records each head and relation.',
    '',
    'This section described the parser. That is the whole parser setup.',
    '',
    'Set cache to true to enable caching; set it to false to disable caching.',
  ].join('\n'));

  assert.ok(!fired(ordinary, 'referential-compression'));
  assert.ok(!fired(ordinary, 'premature-closure'));
  assert.ok(!fired(ordinary, 'binary-outcome-frame'));
  assert.ok(!fired(ordinary, 'undefined-key-term'));
});

test('a key term with an actual definition is not reported as undefined', async () => {
  const relativeDefinition = await lint([
    'We use a rule that maps each input number to an output number.',
    '',
    'The rule produces one output for each input.',
    '',
    'Can the rule reproduce all sixty observed pairs?',
  ].join('\n'));
  assert.ok(!fired(relativeDefinition, 'undefined-key-term'));

  const copularDefinition = await lint([
    'A rule is a mapping from an input number to an output number.',
    '',
    'This rule uses multiplication and addition.',
    '',
    'Can the rule reproduce all sixty observed pairs?',
  ].join('\n'));
  assert.ok(!fired(copularDefinition, 'undefined-key-term'));
});

test('a bare-pronoun run remains informational without stronger contextual tells', async () => {
  const explanation = await lint([
    'The term covers several different techniques.',
    'It describes an attempt to stop unauthorized copying.',
    'It can inconvenience paying customers.',
    'It may do little to stop a copy whose restrictions have already been removed.',
  ].join(' '));
  assert.equal(finding(explanation, 'referential-compression')?.confidence, 'low');
  assert.ok(!fired(explanation, 'premature-closure'));
  assert.ok(!fired(explanation, 'binary-outcome-frame'));
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

test('comma-splice catches clipped parataxis but not coordination or comment clauses', async () => {
  assert.ok(fired(await lint('Thanks for the demo, I enjoyed it.'), 'comma-splice'));
  assert.ok(!fired(await lint('It rained all day, but we still went out.'), 'comma-splice'));
  assert.ok(!fired(await lint('Paris, you see, was our home.'), 'comma-splice'));
});

test('comma-splice detection is invariant to clause length', async () => {
  const short = finding(
    await lint('Thanks for the detailed benchmark, I enjoyed reading it.'),
    'comma-splice',
  );
  const expansions = [
    'Thanks for the detailed benchmark and the careful notes from your week-long production test, I enjoyed reading it.',
    'Thanks for the detailed benchmark, I enjoyed reading every section of it during the quiet train ride home yesterday.',
    'Thanks for the detailed benchmark and the careful notes from your week-long production test, '
      + 'I enjoyed reading every section of it during the quiet train ride home yesterday.',
  ];

  assert.equal(short?.confidence, 'low');
  assert.match(short?.message ?? '', /clipped parataxis/);
  for (const sentence of expansions) {
    const expanded = finding(await lint(sentence), 'comma-splice');
    assert.equal(expanded?.confidence, 'low', sentence);
    assert.match(expanded?.message ?? '', /two independent clauses/, sentence);
  }
});

test('repeated comma splices are promoted even when only one is clipped', async () => {
  const lints = await lint([
    'Thanks for the demo, I enjoyed it.',
    'Thanks for the detailed benchmark and the careful notes from your week-long production test, '
      + 'I enjoyed reading every section of it during the quiet train ride home yesterday.',
  ].join(' '));
  const splices = lints.filter((item) => item.ruleId === 'ai-style/comma-splice');
  assert.equal(splices.length, 2);
  assert.ok(splices.every((item) => item.confidence === 'medium'));
});

test('comma-splice leaves explicit grammatical links and quoted speech alone at any length', async () => {
  const clean = [
    'It rained across the northern valley throughout the entire afternoon, but we still walked home before sunset.',
    'Because the database migration ran for most of the afternoon, the release manager postponed the production deploy.',
    'The report, which the auditor signed after reviewing every appendix, reached the board this morning.',
    'The deployment finished before sunrise; the support team published its incident note before lunch.',
    '“The release is ready,” she said after reading the final test report.',
    'The review was useful, I think.',
  ];
  for (const sentence of clean) {
    assert.ok(!fired(await lint(sentence), 'comma-splice'), sentence);
  }
});

test('agentless-opener wants a doer, but leaves either register alone', async () => {
  assert.ok(fired(await lint('Notes attached, and they are a fuller record than the summary.'), 'agentless-opener'));
  assert.ok(!fired(await lint('I enjoyed the demo, and the notes are attached.'), 'agentless-opener'));
  assert.ok(!fired(await lint('Notes attached.'), 'agentless-opener'));
});

test('setup-fragment flags staged points, not stated ones', async () => {
  assert.ok(fired(await lint('One thing I wanted to put on the table before I talk to the reviewers.'), 'setup-fragment'));
  assert.ok(!fired(await lint('One thing is clear: the tests are slow.'), 'setup-fragment'));
});

test('performed-candor catches announced honesty, not honest description', async () => {
  assert.ok(fired(await lint('I would rather say that plainly than have you guess.'), 'performed-candor'));
  assert.ok(fired(await lint('To be fully transparent, the budget is gone.'), 'performed-candor'));
  assert.ok(!fired(await lint('The report is transparent about its methods.'), 'performed-candor'));
});

test('filler-intensifiers flags the first-person stance shape and gates the spray', async () => {
  assert.ok(fired(await lint('I am genuinely open to both designs.'), 'filler-intensifiers'));
  assert.ok(!fired(await lint('The button is really close to the edge.'), 'filler-intensifiers'));
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
