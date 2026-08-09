import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Linter, resolveConfig, type Lint, type ResolvedConfig } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { aiStyle, score, strict } from '../src/index.js';

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
const AB_FIXTURES = ['human-1.txt', 'ai-1.txt', 'ai-2.txt', 'ai-3.txt'] as const;
const fixtureUrl = (name: string): URL => new URL(`../../../a-b-test/${name}`, import.meta.url);
const fixture = (name: string): string => readFileSync(fixtureUrl(name), 'utf8');
const hasAbFixtures = AB_FIXTURES.every((name) => existsSync(fixtureUrl(name)));
const warnings = (lints: Lint[]): Lint[] => lints.filter((item) => item.confidence !== 'low');

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
  assert.equal(
    finding(
      await lint('The change that matters is not parallelism, it is decomposition: each unit receives a focused search.'),
      'negative-contrast',
    )?.confidence,
    'medium',
  );
  assert.ok(!fired(
    await lint('The change is not caused by parallelism because every unit uses the same worker.'),
    'negative-contrast',
  ));
});

test('dramatic fragments are graded without matching ordinary transitions', async () => {
  assert.equal(finding(await lint('The old workflow required a manual review. Until now. The new job automates it.'), 'dramatic-fragment')?.confidence, 'medium');
  assert.equal(finding(await lint('The team repeated that process. For years. The new job automates it.'), 'dramatic-fragment')?.confidence, 'low');
  assert.ok(!fired(await lint('Until now, the workflow required a manual review.'), 'dramatic-fragment'));
});

test('performed revelation detects a repeated sequence of staged punchlines', async () => {
  const text = [
    'The final example changes direction when the second value crosses zero. That last one turns out to be the whole lesson.',
    '',
    'We already wrote the score calculation, so its slope is available to us. So why are we poking it like a stranger?',
    '',
    'This method spends two full runs to estimate a direction that the formula already contains. A cheap claim deserves a race.',
    '',
    'The new error comes from a parameter the current expression cannot represent. This failure is a different animal from the last two.',
    '',
    'The search can only move through values represented by the current formula. You cannot search your way to a shape you cannot express.',
  ].join('\n');
  const hits = (await lint(text)).filter((item) => item.ruleId === 'ai-style/performed-revelation');
  assert.ok(hits.length >= 4);
  assert.ok(hits.every((item) => item.confidence === 'medium'));
  assert.match(hits[0]?.message ?? '', /prepared revelations|punchline/i);
});

test('performed revelation stays quiet for one earned punchy line', async () => {
  const text = [
    'We ran the examples with both values and compared the errors.',
    'That last one turns out to be the whole lesson.',
    'The next section derives the same result from the score calculation.',
  ].join(' ');
  assert.ok(!fired(await lint(text), 'performed-revelation'));
});

test('performed revelation does not punish plain connective exposition', async () => {
  const text = [
    'In lesson 02, we changed one number and ran all the examples again to see what happened.',
    'We had to do that twice for every number.',
    'But we wrote the mistake-score ourselves, so we already know the calculation it performs.',
    'In this lesson, we will use that calculation to work out which direction each number should move.',
    '',
    'The first knob multiplies the input.',
    'The second knob is added afterward.',
    'We will calculate both effects before changing either value.',
  ].join('\n');
  assert.ok(!fired(await lint(text), 'performed-revelation'));
});

test('performed revelation does not equate short human paragraphs with headline copy', async () => {
  const fieldNotes = [
    'I left the office just after six.',
    '',
    'Rain had filled the gutter outside.',
    '',
    'Maya waited under the pharmacy awning.',
    '',
    'We took the slow bus home.',
    '',
    'A dog slept beneath the back seat.',
    '',
    'The driver missed our usual turn.',
    '',
    'I noticed only when the shops changed.',
    '',
    'We walked back along the canal.',
  ].join('\n');
  assert.ok(!fired(await lint(fieldNotes), 'performed-revelation'));
});

test('performed revelation cannot be diluted by unrelated explanatory prose', async () => {
  const staged = [
    'The final example reverses near zero. That last one turns out to be the whole lesson.',
    '',
    'We already know the score formula. So why are we poking it like a stranger?',
    '',
    'This estimate costs two complete runs. A cheap claim deserves a race.',
    '',
    'The expression lacks the required parameter. This failure is a different animal from the last two.',
  ];
  const padding = Array.from(
    { length: 24 },
    (_, index) => `Appendix ${index + 1} records the input, calculated score, and observed output for that run.`,
  );
  const hits = (await lint([...staged, '', ...padding].join('\n')))
    .filter((item) => item.ruleId === 'ai-style/performed-revelation');
  assert.ok(hits.length >= 3);
  assert.ok(hits.every((item) => item.confidence === 'medium'));
});

test('performed revelation does not use Markdown headings as authorship evidence', async () => {
  const staged = await lint([
    '# Guess and check',
    '',
    '## The question, before any formula',
    '',
    'We begin with two values and a score.',
    '',
    '## Watch the next limit appear',
    '',
    'The estimate stops improving near the boundary.',
    '',
    '## Meet the bend we were missing',
    '',
    'A second parameter lets the curve turn.',
  ].join('\n'));
  assert.ok(!fired(staged, 'performed-revelation'));

  const navigational = await lint([
    '# Guess and check',
    '',
    '## Choosing the starting values',
    '',
    'We begin with two values and a score.',
    '',
    '## Calculating the error',
    '',
    'The estimate stops improving near the boundary.',
    '',
    '## Updating both values',
    '',
    'A second parameter lets the curve turn.',
  ].join('\n'));
  assert.ok(!fired(navigational, 'performed-revelation'));
});

test('A/B prose gate warns on the AI rewrites and passes the human source', { skip: !hasAbFixtures }, async () => {
  const human = await lint(fixture('human-1.txt'));
  const ai1 = await lint(fixture('ai-1.txt'));
  const ai2 = await lint(fixture('ai-2.txt'));
  const ai3 = await lint(fixture('ai-3.txt'));

  assert.equal(
    warnings(human).length,
    0,
    `human warnings:\n${warnings(human).map((item) => `${item.ruleId}: ${item.text}`).join('\n')}`,
  );
  for (const [name, result] of [['ai-1.txt', ai1], ['ai-2.txt', ai2], ['ai-3.txt', ai3]] as const) {
    assert.ok(
      result.some((item) => item.ruleId === 'ai-style/performed-revelation' && item.confidence !== 'low'),
      `${name} should trigger the repeated performed-revelation cadence`,
    );
  }
});

test('A/B fixture labels contain distinct prose samples', { skip: !hasAbFixtures }, () => {
  assert.notEqual(fixture('ai-1.txt'), fixture('human-1.txt'));
});

test('repeated absolutes in an examined claim stay informational when the paragraph supplies the argument', async () => {
  const result = await lint([
    "If it's impossible to make a billion dollars without cheating, which of those two numbers is impossible?",
    "It's certainly not impossible to grow at fifteen percent a month without cheating.",
    'Startups do that every week, and the calculation above supplies the measured rate.',
  ].join(' '));
  assert.ok(result.filter((item) => item.ruleId === 'ai-style/absolute-claim').every((item) => item.confidence === 'low'));
  assert.ok(result.filter((item) => item.ruleId === 'ai-style/unsupported-certainty').every((item) => item.confidence === 'low'));
});

test('negative parallelism is informational until it becomes a repeated cadence', async () => {
  assert.equal(
    finding(await lint('The objection turns out not merely to be false, but false in an illuminating way.'), 'negative-parallelism')?.confidence,
    'low',
  );
  const repeated = (await lint([
    'The tool is not only faster but also easier to operate.',
    'The result is not merely accurate but also transformative.',
  ].join(' '))).filter((item) => item.ruleId === 'ai-style/negative-parallelism');
  assert.equal(repeated.length, 2);
  assert.ok(repeated.every((item) => item.confidence === 'medium'));

});

test('logical second-person passives do not imply a hidden accountable actor', async () => {
  const result = finding(
    await lint("If you want to do it yourself, you'll be forced to understand how it's done."),
    'passive-actor-hiding',
  );
  assert.equal(result?.confidence, 'low');
});

test('measured comparisons and explicit coordinators are not promoted as unsupported or spliced', async () => {
  assert.ok(!fired(
    await lint('To grow 4000x, there has to be at least 4000x more demand than the company serves today.'),
    'unsupported-comparison',
  ));
  assert.ok(!fired(
    await lint('They do not understand exponential growth, so when they see a large outcome, they assume cheating.'),
    'comma-splice',
  ));
});

test('distributed low-confidence candidates do not become a warning merely because a document is long', async () => {
  const paragraphs = Array.from({ length: 18 }, (_, index) => [
    `Example ${index + 1} describes what the team measured during the trial.`,
    index % 3 === 0 ? 'The team can always repeat that measurement under the same conditions.' : '',
  ].filter(Boolean).join(' '));
  const result = await lint(paragraphs.join('\n\n'));
  assert.ok(!warnings(result).some((item) => item.ruleId === 'ai-style/evidence-cluster'));
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

test('passive voice density catches a sustained local habit', async () => {
  const result = await lint([
    'The request is validated before dispatch.',
    'The payload is copied into the queue.',
    'A worker reads the next item and calls the provider.',
    'The response is stored after the call.',
    'The API returns the stored result to the client.',
    'Expired records are removed every night.',
  ].join(' '));
  assert.equal(finding(result, 'passive-voice-density')?.confidence, 'medium');
});

test('passive voice density leaves an occasional implementation passive alone', async () => {
  const result = await lint([
    'The gateway validates each request.',
    'The payload is copied into the queue.',
    'A worker reads the next item.',
    'The worker calls the provider and records the response.',
    'The API returns that result to the client.',
    'Expired records are removed every night.',
  ].join(' '));
  assert.ok(!fired(result, 'passive-voice-density'));

  const checklist = await lint([
    '- Requests are validated before dispatch.',
    '- Payloads are copied into the queue.',
    '- Responses are stored after each call.',
    '- Expired records are removed every night.',
  ].join('\n'));
  assert.ok(!fired(checklist, 'passive-voice-density'));
});

test('headline fragments flag compressed explanation openers, not headings or complete statements', async () => {
  const fragments = await lint([
    'Prior L2 criteria example (Stage A of the inventory plan). The function supplies an earlier tree to the prompt.',
    '',
    'The most recent prior L2 subtree per L1 criterion of a control, for use as prompt context.',
  ].join('\n'));
  const hits = fragments.filter((item) => item.ruleId === 'ai-style/headline-fragment');
  assert.equal(hits.length, 2);
  assert.ok(hits.every((item) => item.confidence === 'low'));

  assert.ok(!fired(await lint([
    '## Prior criteria examples',
    '',
    'The function supplies an earlier tree to the prompt.',
  ].join('\n')), 'headline-fragment'));
  assert.ok(!fired(
    await lint('The function returns the most recent prior subtree for each active criterion.'),
    'headline-fragment',
  ));

  const decorated = await lint([
    '─── inventory-first scope units (Stages B/C/D/E) ───────────',
    'The function groups the fields used by the next stages.',
  ].join('\n'));
  assert.equal(finding(decorated, 'headline-fragment')?.confidence, 'low');
});

test('implementation detail pileups separate reader context from identifier density', async () => {
  const compressed = await lint([
    'Prior L2 criteria example (Stage A of the inventory-first scope plan).',
    'The subtree travels FLATTENED (pre-order plus `depth`) rather than nested, so the wire contract needs no recursive TypeBox.',
    '`anchorType` and `enforcementScope` stay free-form for the same generic-depth reason the projections above cite; the activity only renders them and never branches on them.',
  ].join(' '));
  assert.equal(finding(compressed, 'implementation-detail-pileup')?.confidence, 'medium');

  const explained = await lint([
    'This function gives the prompt an example of criteria designed for an earlier application.',
    'It first finds the active parent criterion.',
    'The response includes `anchorType`, `enforcementScope`, and `depth` so the prompt can reproduce the same shape.',
    'If no earlier example exists, the function returns an empty list.',
  ].join(' '));
  assert.ok(!fired(explained, 'implementation-detail-pileup'));

  const ordinaryReference = await lint([
    'The response includes `id`, `status`, and `createdAt`.',
    '`status` can be pending or complete.',
    'The client checks that value before showing the result.',
  ].join(' '));
  assert.ok(!fired(ordinaryReference, 'implementation-detail-pileup'));

  const identifierList = await lint([
    '- `id`: stable record identifier.',
    '- `status`: pending or complete.',
    '- `createdAt`: creation timestamp.',
    '- `updatedAt`: most recent update timestamp.',
  ].join('\n'));
  assert.ok(!fired(identifierList, 'implementation-detail-pileup'));

  const enumComment = await lint([
    '─── inventory-first scope units (Stages B/C/D/E) ───────────',
    'Free-form `t.String()` is used for the narrow text enums below (anchorType, enforcementScope, phase) for the same Elysia generic-depth reason the projections above cite:',
    'literal unions on these wide row shapes exceed the InlineHandler recursion budget.',
    'The consumers only render them or compare them to a known constant, so a `string` wire type is sound.',
  ].join(' '));
  assert.equal(finding(enumComment, 'implementation-detail-pileup')?.confidence, 'medium');

  const processNarration = await lint([
    'This helper keeps the same evidence gate — an item is only a candidate if THIS application already has evidence for it — and then narrows to the work unit before ranking.',
    'Narrowing is a RE-RANK plus a soft filter, never a hard one: if the filter would empty the result set, the unfiltered ranking is returned instead.',
    'A unit that returns nothing because the hint was too literal is strictly worse than one that returns slightly-off candidates the agent can reject.',
  ].join(' '));
  assert.equal(finding(processNarration, 'implementation-detail-pileup')?.confidence, 'medium');

  const ordinaryFallback = await lint([
    'This helper checks the local cache before querying the database.',
    'If the cache has no value, the helper reads the record from storage and stores it for the next request.',
    'The caller receives the same record in either case.',
  ].join(' '));
  assert.ok(!fired(ordinaryFallback, 'implementation-detail-pileup'));
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

test('Markdown structure is not an AI-style rule or lint signal', async () => {
  assert.ok(!('mechanical-outline' in aiStyle.rules));
  const markdown = await lint([
    '---',
    '',
    '## Why this works',
    '',
    '**Planning:** write the request.',
    '',
    '---',
    '',
    '## The key trick',
    '',
    '- **Planning:** write the request.',
    '- **Requirements:** review what gets built.',
    '- **Implementation:** document why, never what.',
    '- **Testing:** test the parser.',
    '- **Deployment:** use a flag.',
    '- **Maintenance:** log the calls.',
  ].join('\n'));
  assert.ok(!fired(markdown, 'mechanical-outline'));
  assert.ok(!fired(markdown, 'performed-revelation'));
  assert.ok(!fired(markdown, 'evidence-cluster'));
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

test('agentless rationale fragments distinguish compressed decisions from complete explanations', async () => {
  assert.equal(
    finding(
      await lint('Kept modest deliberately: the win comes from narrower prompts, not from saturating the model gate.'),
      'agentless-rationale',
    )?.confidence,
    'medium',
  );
  assert.equal(
    finding(
      await lint('Used by the MCP build tool and by the bulk workflow.'),
      'agentless-rationale',
    )?.confidence,
    'low',
  );
  assert.ok(!fired(
    await lint('The workflow keeps concurrency modest because narrower prompts provide the benefit.'),
    'agentless-rationale',
  ));

  const repeated = (await lint([
    'Used by the planner after it creates the work units.',
    'Called by the finalizer after every unit has returned a result.',
  ].join(' '))).filter((item) => item.ruleId === 'ai-style/agentless-rationale');
  assert.equal(repeated.length, 2);
  assert.ok(repeated.every((item) => item.confidence === 'medium'));

  const distant = (await lint([
    'Used by the planner after it creates the work units.',
    'The planner reads the control and creates one unit for each criterion.',
    'Each unit records the service that gives the search its scope.',
    'The workflow sends those units through the shared model throttle.',
    'The finalizer waits until every search has returned.',
    'Called by the finalizer after every unit has returned a result.',
  ].join(' '))).filter((item) => item.ruleId === 'ai-style/agentless-rationale');
  assert.equal(distant.length, 2);
  assert.ok(distant.every((item) => item.confidence === 'low'));
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
