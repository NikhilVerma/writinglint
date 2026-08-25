import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, test } from 'node:test';
import { buildDocument, Linter, resolveConfig, type Lint } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { buildReadingTrace, canonicalEntityKey, readerFirst, recommended, strict } from '../src/index.js';

let linter: Linter;

before(async () => {
  linter = new Linter(await loadParser());
});

async function lint(text: string, includeInfo = false): Promise<Lint[]> {
  return (await linter.lint(text, resolveConfig(includeInfo ? strict : recommended))).lints;
}

const finding = (lints: Lint[], name: string): Lint | undefined =>
  lints.find((item) => item.ruleId === `reader-first/${name}`);

interface StrictCase {
  id: string;
  bad: string;
  fixed: string;
  expectedRules: string[];
}

async function strictCases(): Promise<StrictCase[]> {
  const source = await readFile(new URL('../eval/strict-cases.jsonl', import.meta.url), 'utf8');
  return source.trim().split('\n').map((line) => JSON.parse(line) as StrictCase);
}

test('the pack exposes document-wide rules through every reader-first preset', () => {
  assert.deepEqual(Object.keys(readerFirst.rules).sort(), [
    'abstract-reference-chain',
    'aside-pileup',
    'concept-introduction-burst',
    'fragment-chain',
    'label-led-explanation',
    'noun-pile',
    'paragraph-load',
    'procedure-thread-detour',
    'relationship-pileup',
    'sentence-load',
    'sustained-buffer-pressure',
    'undefined-decision-stack',
    'unexplained-initialism',
    'unoriented-reactivation',
    'unresolved-idea-stack',
  ]);
  assert.deepEqual(Object.keys(readerFirst.configs ?? {}).sort(), ['ci', 'recommended', 'strict']);
  assert.equal(readerFirst.configs?.recommended?.rules?.['reader-first/relationship-pileup'], 'auto');
  assert.equal(readerFirst.configs?.strict?.rules?.['reader-first/relationship-pileup'], 'auto');
});

test('sentence-load reports a long sentence with clauses and internal labels', async () => {
  const text = 'The scopePlanner reads `frameworkCriterionId`, and if the legacy root has no matching identifier, it normalizes the criterion name, compares every candidate, keeps the most recent result, and then returns the fallback tree so the next workflow can continue without losing prior context.';
  const match = finding(await lint(text), 'sentence-load');
  assert.ok(match);
  assert.match(match.message, /words.*clause breaks.*technical labels/);
  assert.deepEqual({ start: match.start, end: match.end }, { start: 0, end: text.length });
  assert.ok(match.anchors?.length);
  assert.ok(match.anchors?.every(({ kind, offset }) => kind === 'split-point' && offset > match.start && offset < match.end));
  assert.deepEqual(match.magnitude?.metrics.map(({ name }) => name), [
    'words',
    'clause-breaks',
    'technical-labels',
    'heavy-punctuation',
    'nearby-loaded-sentences',
  ]);
  assert.ok((match.magnitude?.metrics.find(({ name }) => name === 'words')?.value ?? 0) >= 32);
});

test('sentence-load enforces the strict 32-word limit even when the structure is plain', async () => {
  const text = 'The technician opened the cabinet and checked every cable in the upper tray before recording the serial numbers in the maintenance log for the team that would return during the next shift.';
  assert.equal(finding(await lint(text), 'sentence-load')?.severity, 'warn');
});

test('sentence-load reports a very long sentence even without code identifiers', async () => {
  const text = `${Array.from({ length: 46 }, (_, index) => `word${index}`).join(' ')}.`;
  assert.ok(finding(await lint(text), 'sentence-load'));
});

test('paragraph-load reports only a large prose block', async () => {
  const sentence = 'The operator checks the record and writes the result before the next inspection begins.';
  const loaded = Array.from({ length: 10 }, () => sentence).join(' ');
  assert.ok(finding(await lint(loaded), 'paragraph-load'));
  assert.equal(finding(await lint(`${sentence} ${sentence} ${sentence}`), 'paragraph-load'), undefined);
});

test('unexplained-initialism reports a repeated unexplained term at its first use', async () => {
  const text = 'The MCP starts the local service. The MCP then reads the project configuration.';
  const match = finding(await lint(text), 'unexplained-initialism');
  assert.equal(match?.text, 'MCP');
  assert.deepEqual({ start: match?.start, end: match?.end }, { start: 4, end: 7 });
});

test('unexplained-initialism accepts an introduced term and common web vocabulary', async () => {
  const text = 'The Model Context Protocol (MCP) starts the service. The MCP reads a JSON file from the API.';
  assert.equal(finding(await lint(text), 'unexplained-initialism'), undefined);
});

test('noun-pile reports a parsed common-noun stack but leaves ordinary pairs alone', async () => {
  const loaded = await lint('The team changed the customer onboarding flow migration project timeline yesterday.');
  assert.ok(finding(loaded, 'noun-pile'));
  assert.equal(finding(await lint('The team changed the migration timeline yesterday.'), 'noun-pile'), undefined);
});

test('concept-introduction-burst reports terminology introduced faster than it can be used', async () => {
  const terms = ['gateway', 'ledger', 'profile', 'channel', 'policy', 'registry', 'schema', 'signal', 'scope', 'trigger', 'workflow', 'checkpoint'];
  const introduction = `The platform contains a ${terms.join(', a ')}, and a monitor.`;
  const uses = terms.map((term) => `The ${term} has a documented purpose.`).join(' ');
  const match = finding(await lint(`${introduction}\n\n${uses}`, true), 'concept-introduction-burst');
  assert.ok(match);
  assert.equal(match.text, introduction);
  assert.match(match.message, /introduces 12 concepts/);
});

test('concept-introduction-burst accepts the same terminology when it is introduced gradually', async () => {
  const text = `The gateway accepts a request. The gateway then sends it to the ledger.

The ledger records the request. A profile identifies its owner.

The profile selects a channel. The channel applies a policy.

The policy names a registry. The registry validates the schema.

The schema produces a signal. The signal limits the scope.

The scope selects a trigger. The trigger starts the workflow.

The workflow ends at a checkpoint. The checkpoint records the result.`;
  assert.equal(finding(await lint(text, true), 'concept-introduction-burst'), undefined);
});

test('concept identity collapses singular and plural nouns without changing proper names', async () => {
  assert.equal(canonicalEntityKey({ lower: 'controls', upos: 'NOUN' }), 'control');
  assert.equal(canonicalEntityKey({ lower: 'criteria', upos: 'NOUN' }), 'criterion');
  assert.equal(canonicalEntityKey({ lower: 'policies', upos: 'NOUN' }), 'policy');
  assert.equal(canonicalEntityKey({ lower: 'James', upos: 'PROPN' }), 'james');

  const text = 'Controls, a control, policies, a policy, gateways, a gateway, ledgers, a ledger, profiles, a profile, channels, a channel, registries, a registry, schemas, a schema, signals, a signal, scopes, a scope, triggers, and a trigger are recorded. Every control, policy, gateway, ledger, profile, channel, registry, schema, signal, scope, and trigger has an owner.';
  assert.equal(finding(await lint(text, true), 'concept-introduction-burst'), undefined);
});

test('reading trace preserves ordered propositions and coordinated participants', async () => {
  const text = 'Priya walked to Omar. Omar talked to Lena. Lena danced with Priya. Omar and Lena went outside.';
  const document = await buildDocument(text, await loadParser());
  const trace = buildReadingTrace(document);
  assert.deepEqual(trace.propositions.map((proposition) => ({
    predicate: proposition.predicate.key,
    subjects: proposition.subjects.map((subject) => subject.key),
    objects: proposition.objects.map((object) => object.key),
  })), [
    { predicate: 'walked', subjects: ['priya'], objects: ['omar'] },
    { predicate: 'talked', subjects: ['omar'], objects: ['lena'] },
    { predicate: 'danced', subjects: ['lena'], objects: ['priya'] },
    { predicate: 'went', subjects: ['omar', 'lena'], objects: [] },
  ]);
});

test('reading trace is shared by document-wide rules scanning the same document', async () => {
  const document = await buildDocument('Priya called Omar. Omar thanked Lena.', await loadParser());
  assert.equal(buildReadingTrace(document), buildReadingTrace(document));
});

test('reading trace inherits the subject of a coordinated predicate', async () => {
  const document = await buildDocument('Priya opened the letter and showed it to Omar.', await loadParser());
  const propositions = buildReadingTrace(document).propositions;
  assert.deepEqual(propositions.map((proposition) => ({
    predicate: proposition.predicate.key,
    subjects: proposition.subjects.map((subject) => ({ key: subject.key, inherited: subject.inherited ?? false })),
  })), [
    { predicate: 'opened', subjects: [{ key: 'priya', inherited: false }] },
    { predicate: 'showed', subjects: [{ key: 'priya', inherited: true }] },
  ]);
});

test('reading trace records sequential introductions, active state, and role changes', async () => {
  const text = 'Priya walked to Omar. Omar talked to Lena. Lena danced with Priya.';
  const trace = buildReadingTrace(await buildDocument(text, await loadParser()));
  assert.deepEqual(trace.moments.map((moment) => ({
    introduced: moment.introducedEntities,
    active: moment.activeEntities,
    relationships: moment.newRelationships.map((relationship) => relationship.key),
    roleChanges: moment.roleChanges,
  })), [
    {
      introduced: ['priya', 'omar'],
      active: ['priya', 'omar'],
      relationships: ['priya->walked->omar'],
      roleChanges: [],
    },
    {
      introduced: ['lena'],
      active: ['priya', 'omar', 'lena'],
      relationships: ['omar->talked->lena'],
      roleChanges: [{ entity: 'omar', from: 'oblique', to: 'subject' }],
    },
    {
      introduced: [],
      active: ['priya', 'omar', 'lena'],
      relationships: ['lena->danced->priya'],
      roleChanges: [
        { entity: 'lena', from: 'oblique', to: 'subject' },
        { entity: 'priya', from: 'subject', to: 'oblique' },
      ],
    },
  ]);
  assert.deepEqual(trace.moments.map((moment) => moment.load), [
    { pushes: 3, reinforcements: 0, pops: 0, reactivations: 0, activeEntityFrames: 2, activeRelationshipFrames: 1, openIdeaFrames: 0, openDecisionFrames: 0, roleChanges: 0, netInflow: 3 },
    { pushes: 2, reinforcements: 1, pops: 0, reactivations: 0, activeEntityFrames: 3, activeRelationshipFrames: 2, openIdeaFrames: 0, openDecisionFrames: 0, roleChanges: 1, netInflow: 2 },
    { pushes: 1, reinforcements: 2, pops: 0, reactivations: 0, activeEntityFrames: 3, activeRelationshipFrames: 3, openIdeaFrames: 0, openDecisionFrames: 0, roleChanges: 2, netInflow: 1 },
  ]);
});

test('reading trace marks structural boundaries and dormant entity reactivation', async () => {
  const text = `Priya opened the gate.

Omar checked the road. Lena watched the river. The driver parked the car.

Priya closed the gate.`;
  const trace = buildReadingTrace(await buildDocument(text, await loadParser()));
  assert.equal(trace.moments[1]?.structuralBoundaryBefore, true);
  assert.equal(trace.moments.at(-1)?.structuralBoundaryBefore, true);
  assert.deepEqual(trace.moments.at(-1)?.reactivatedEntities, ['priya', 'gate']);
  assert.ok(trace.moments.some((moment) => moment.bufferEvents.some((event) =>
    event.kind === 'pop' && event.itemKind === 'entity' && event.key === 'priya' && event.reason === 'decay')));
  assert.deepEqual(trace.moments.at(-1)?.bufferEvents.filter((event) => event.key === 'priya'), [
    { kind: 'reactivate', itemKind: 'entity', key: 'priya', reason: 'mention' },
  ]);
});

test('reading trace pops active frames after an explicit consolidation', async () => {
  const text = 'Priya introduced Omar to Lena. Taken together, the introductions established the group. The train arrived at the station.';
  const trace = buildReadingTrace(await buildDocument(text, await loadParser()));
  const final = trace.moments.at(-1)!;
  assert.ok(final.releasedEntities.includes('priya'));
  assert.ok(final.releasedEntities.includes('omar'));
  assert.ok(final.bufferEvents.some((event) => event.kind === 'pop' && event.reason === 'consolidation'));
});

test('reading trace does not bridge across an excluded disclosure', async () => {
  const text = 'The introduction names the gateway.\n\nOptional hidden history.\n\nThe conclusion returns to the gateway.';
  const start = text.indexOf('Optional');
  const end = start + 'Optional hidden history.'.length;
  const document = await buildDocument(text, await loadParser(), {
    regions: [
      { id: 'document', role: 'document', start: 0, end: text.length },
      { id: 'disclosure', role: 'disclosure', start, end, parentId: 'document' },
    ],
  });
  const trace = buildReadingTrace(document);
  assert.deepEqual(trace.units.map((unit) => unit.text), [
    'The introduction names the gateway.',
    'The conclusion returns to the gateway.',
  ]);
  assert.equal(trace.units.some((unit) => unit.start < start && unit.end > end), false);
});

test('relationship-pileup catches rapid relationship and role churn among a few people', async () => {
  const text = 'Priya walked to Omar. Omar talked to Lena. Lena danced with Priya. Priya called Omar. Omar looked at Priya. Lena questioned Omar. Priya thanked Lena.';
  const match = finding(await lint(text, true), 'relationship-pileup');
  assert.ok(match);
  assert.equal(match.text, text);
  assert.match(match.message, /7 relationships among 3 participants/);
  assert.deepEqual(match.evidence?.[0]?.data, {
    relationships: 7,
    participants: 'priya, omar, lena',
    directedPairs: 6,
    roleChanges: 10,
    propositions: 7,
  });
});

test('relationship-pileup accepts the same relationships when the writing groups them into stages', async () => {
  const text = `Priya walked to Omar. Omar talked to Lena. Taken together, the introductions established who knew whom.

Lena danced with Priya. Priya called Omar. By then, the afternoon meetings were complete.

Omar looked at Priya. Lena questioned Omar.

Priya thanked Lena.`;
  assert.equal(finding(await lint(text, true), 'relationship-pileup'), undefined);
});

test('relationship-pileup does not treat blank lines alone as a complete memory reset', async () => {
  const text = `Priya walked to Omar. Omar talked to Lena.

Lena danced with Priya. Priya called Omar.

Omar looked at Priya. Lena questioned Omar. Priya thanked Lena.`;
  assert.ok(finding(await lint(text, true), 'relationship-pileup'));
});

test('relationship-pileup leaves repeated stable roles alone', async () => {
  const text = 'Priya called Omar. Priya thanked Omar. Priya visited Omar. Priya helped Omar. Priya greeted Omar. Priya followed Omar. Priya joined Omar.';
  assert.equal(finding(await lint(text, true), 'relationship-pileup'), undefined);
});

test('unoriented-reactivation reports a dropped relationship resumed without a bridge', async () => {
  const text = 'Priya called Omar. The train reached Bristol. Rain covered the platform. Lena found a taxi. The driver loaded the cases. Priya called Omar.';
  const match = finding(await lint(text, true), 'unoriented-reactivation');
  assert.ok(match);
  assert.equal(match.text, 'Priya called Omar.');
  assert.match(match.message, /resumes priya, omar after 4 intervening sentences/);
  assert.equal(match.severity, 'warn');
});

test('unoriented-reactivation accepts an explicit return to a dropped relationship', async () => {
  const text = 'Priya called Omar. The train reached Bristol. Rain covered the platform. Lena found a taxi. The driver loaded the cases. Returning to Priya and Omar, Priya called Omar again.';
  assert.equal(finding(await lint(text, true), 'unoriented-reactivation'), undefined);
});

test('unresolved-idea-stack reports several promised explanations left open together', async () => {
  const text = 'We will explain the gateway later. We will describe the ledger below. We will cover the registry in the following section. The operator starts the service.';
  const match = finding(await lint(text, true), 'unresolved-idea-stack');
  assert.ok(match);
  assert.match(match.message, /3 promised explanations open/);
  assert.equal(match.severity, 'info');
});

test('unresolved-idea-stack pops a promise when its topic returns', async () => {
  const text = 'We will explain the gateway later. The operator opens the console. The gateway routes each request to the correct service.';
  const trace = buildReadingTrace(await buildDocument(text, await loadParser()));
  assert.equal(trace.moments[0]?.activeIdeas.length, 1);
  assert.equal(trace.moments.at(-1)?.activeIdeas.length, 0);
  assert.ok(trace.moments.at(-1)?.ideaEvents.some((event) => event.kind === 'pop' && event.idea.topics.includes('gateway')));
  assert.equal(finding(await lint(text, true), 'unresolved-idea-stack'), undefined);
});

test('undefined-decision-stack reports accumulated judgments with no operational criteria', async () => {
  const text = 'The reviewer must accept relevant evidence. The service should reject materially weakened requests. Prefer a small candidate set. The agent must use sufficient support.';
  const match = finding(await lint(text), 'undefined-decision-stack');
  assert.ok(match);
  assert.match(match.message, /4 undefined decision standards \(relevant, material, small, sufficient\)/);
  assert.equal(match.severity, 'warn');
  assert.deepEqual((match.evidence ?? []).map((item) => item.data?.term), ['relevant', 'material', 'small', 'sufficient']);
});

test('undefined-decision-stack releases standards after observable definitions', async () => {
  const text = 'Relevant means cited by the current policy. Material means changing an enforced outcome. Small means at most five candidates. Sufficient means two independent sources. The reviewer must accept relevant evidence. The service should reject material changes. Prefer a small candidate set. The agent must use sufficient support.';
  const document = await buildDocument(text, await loadParser());
  const trace = buildReadingTrace(document);
  assert.equal(trace.moments.at(-1)?.activeDecisionStandards.length, 0);
  assert.equal(finding(await lint(text), 'undefined-decision-stack'), undefined);
});

test('procedure-thread-detour finds an output abandoned for one numbered step and then resumed', async () => {
  const text = 'Transform the request into records.\n\nInspect the archive.\n\nPublish the records.';
  const titles = ['Transform the request into records.', 'Inspect the archive.', 'Publish the records.'];
  const regions = titles.map((title, index) => {
    const start = text.indexOf(title);
    return { id: `step:${index}`, role: 'list-item' as const, start, end: start + title.length, metadata: { ordered: true, ordinal: index + 1 } };
  });
  const lints = (await linter.lint(text, resolveConfig(strict), { regions })).lints;
  const match = finding(lints, 'procedure-thread-detour');
  assert.ok(match);
  assert.equal(match.text, 'Inspect the archive.');
  assert.match(match.message, /interrupts the record thread/);
});

test('procedure-thread-detour accepts a numbered step that consumes the prior output', async () => {
  const text = 'Transform the request into records.\n\nValidate the records against the archive.\n\nPublish the records.';
  const titles = ['Transform the request into records.', 'Validate the records against the archive.', 'Publish the records.'];
  const regions = titles.map((title, index) => {
    const start = text.indexOf(title);
    return { id: `step:${index}`, role: 'list-item' as const, start, end: start + title.length, metadata: { ordered: true, ordinal: index + 1 } };
  });
  const lints = (await linter.lint(text, resolveConfig(strict), { regions })).lints;
  assert.equal(finding(lints, 'procedure-thread-detour'), undefined);
});

test('sustained-buffer-pressure reports recurring mixed load instead of one isolated spike', async () => {
  const people = ['Priya', 'Omar', 'Lena', 'Marta', 'Noah', 'Iris'];
  const verbs = ['carried', 'passed', 'showed', 'mailed', 'offered', 'delivered', 'returned', 'brought', 'handed', 'sent', 'moved', 'presented'];
  const text = Array.from({ length: 24 }, (_, index) => {
    const rotated = people.map((_, offset) => people[(index + offset) % people.length]!);
    const suffix = `${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`;
    return `${rotated[0]} ${verbs[index % verbs.length]} Package${suffix} to ${rotated[1]}, ${rotated[2]} ${verbs[(index + 3) % verbs.length]} Record${suffix} to ${rotated[3]}, and ${rotated[4]} ${verbs[(index + 6) % verbs.length]} Letter${suffix} to ${rotated[5]}.`;
  }).join(' ');
  const match = finding(await lint(text, true), 'sustained-buffer-pressure');
  assert.ok(match);
  assert.match(match.message, /active frames.*per sentence.*participant roles/);
  assert.equal(match.severity, 'info');
});

test('sustained-buffer-pressure accepts a long document with stable, gradually changing state', async () => {
  const text = Array.from({ length: 24 }, (_, index) =>
    `The operator checks the gateway during inspection ${index + 1}. The gateway remains available.`).join(' ');
  assert.equal(finding(await lint(text, true), 'sustained-buffer-pressure'), undefined);
});

test('strict includes low-confidence load reviews while recommended keeps warnings', async () => {
  const text = 'The service reads each record, checks its current status, and returns the final result because the next scheduled job needs one stable answer for every request.';
  assert.equal(finding(await lint(text), 'sentence-load'), undefined);
  assert.equal(finding(await lint(text, true), 'sentence-load')?.severity, 'info');
});

test('abstract-reference-chain rejects the compressed PR summary that motivated the rule', async () => {
  const text = 'Three first-run gaps, all the same shape: the capability already existed and nothing told anyone. They ship together because they are one journey — see which Org you are in, make another, land in it.';
  const match = finding(await lint(text), 'abstract-reference-chain');
  assert.equal(match?.severity, 'error');
  assert.equal(match?.text, text);
  assert.match(match?.message ?? '', /State what changed, then list the facts directly/);
});

test('abstract-reference-chain catches several individually grammatical setup sentences', async () => {
  const attempts = [
    'There were three problems the first time people used the product. They were all the same: the feature already existed, but nothing told anyone it was there. They all ship together because they form one simple path.',
    'The first two problems were the same: the ability already existed, but nothing told anyone about it. The third one is new code. They ship together because they form one simple path.',
    'There were three first-run gaps. They all looked the same. They form one journey through the product.',
  ];
  for (const text of attempts) {
    const match = finding(await lint(text), 'abstract-reference-chain');
    assert.ok(match, text);
    assert.equal(match.severity, 'error', text);
  }
});

test('abstract-reference-chain catches a standalone existential setup but permits a direct list introduction', async () => {
  assert.equal(
    finding(await lint('There were three problems the first time people used the product.'), 'abstract-reference-chain')?.severity,
    'warn',
  );
  assert.equal(
    finding(await lint('This PR fixes three problems:'), 'abstract-reference-chain'),
    undefined,
  );
});

test('abstract-reference-chain still catches vague commentary after a concrete list', async () => {
  const text = `This PR fixes three problems:

- The switcher stayed hidden.
- The create button was on the admin page.
- The copy option did not exist.

They ship together because they form one simple path.`;
  assert.equal(finding(await lint(text), 'abstract-reference-chain')?.severity, 'warn');
});

test('abstract-reference-chain allows a direct introduction followed by concrete facts', async () => {
  const text = `This PR fixes three problems:

- The Org switcher was already built but refused to show until you had two Orgs.
- Creating an Org was only possible from the admin page.
- You could not start a new Org as a copy of one you already belong to.`;
  assert.equal(finding(await lint(text), 'abstract-reference-chain'), undefined);
});

test('abstract-reference-chain leaves concrete comparisons and ordinary references alone', async () => {
  const clear = [
    'All three files use the same format.',
    'The installer found three problems. The log named each failed file and gave its line number.',
    'The migration process reads the old records. It converts each record and writes the result.',
    'This process moves each invoice into paid status.',
    'There are three reasons to stop the deployment: the tests fail, the migration is incomplete, and the backup is missing.',
    'There were three errors: invalid email, missing name, and expired token.',
    'The requests failed because they lacked permission.',
    'They failed because the access token expired.',
  ];
  for (const text of clear) {
    assert.equal(finding(await lint(text), 'abstract-reference-chain'), undefined, text);
  }
});

test('abstract-reference-chain generalizes beyond the motivating product vocabulary', async () => {
  const loaded = [
    'There were two issues during account setup. They were both the same. They form one path through onboarding.',
    'Four gaps, all the same shape: the capability existed but nobody could find it. They belong to one flow through checkout.',
    'The approach has one problem. It uses one process because it follows the same pattern.',
  ];
  for (const text of loaded) {
    assert.ok(finding(await lint(text), 'abstract-reference-chain'), text);
  }
});

test('aside-pileup rejects repeated explanatory brackets', async () => {
  const text = `The Org switcher stayed hidden until you had two Orgs (even though it was already built and ready to show).

Creating an Org was only possible from the admin page (even though the team already had permission to create one).

You could not copy an existing Org (this ability is completely new in this change).`;
  const match = finding(await lint(text), 'aside-pileup');
  assert.equal(match?.severity, 'error');
  assert.match(match?.message ?? '', /3 nearby bracketed or dashed explanations/);
});

test('aside-pileup warns on one substantial aside but ignores a short initialism definition', async () => {
  const text = 'The Model Context Protocol (MCP) starts the service. The retry limit is five (including the first request and four later attempts).';
  const match = finding(await lint(text), 'aside-pileup');
  assert.equal(match?.severity, 'warn');
  assert.equal(match?.text, '(including the first request and four later attempts)');
});

test('aside-pileup treats nearby dash and bracket commentary as one repeated pattern', async () => {
  const text = 'The switcher stayed hidden — even after the team had permission to create an Org. The copy option was separate (although both changes affect the same screen).';
  assert.equal(finding(await lint(text), 'aside-pileup')?.severity, 'warn');
});

test('aside-pileup does not mistake a bold dash label for an explanatory aside', async () => {
  const text = '**Fix the worker queue — use the project queue.** The worker now receives tasks from its own project.';
  assert.equal(finding(await lint(text), 'aside-pileup'), undefined);
});

test('fragment-chain rejects repeated subjectless prose but leaves one isolated fragment alone', async () => {
  const loaded = 'Grouped into one release because each change is small. Independent of the other release work. Partially delivers the account setup ticket.';
  assert.equal(finding(await lint(loaded), 'fragment-chain')?.severity, 'error');
  assert.equal(finding(await lint('Unchanged in format and verified on the sample.'), 'fragment-chain'), undefined);
});

test('fragment-chain leaves commands, headings, and concrete sentences alone', async () => {
  const text = 'Run the tests.\n\n## Release checks\n\nThe release job runs every test before publishing.';
  assert.equal(finding(await lint(text), 'fragment-chain'), undefined);
});

test('label-led-explanation escalates repeated bold fragment openers', async () => {
  const text = `**Typed account create.** The endpoint now accepts an account type.

**A real publish control.** The page now shows a Publish button.

**Names and one hidden error.** The menu has a clearer name and failed saves show an error.`;
  assert.equal(finding(await lint(text), 'label-led-explanation')?.severity, 'error');
});

test('label-led-explanation permits a complete bold claim and a direct list', async () => {
  const text = `**The server rejects invalid account types.** The route and service use the same validation.

This change fixes two problems:

- The create button was hidden.
- Failed saves showed no error.`;
  assert.equal(finding(await lint(text), 'label-led-explanation'), undefined);
});

test('label-led-explanation catches repeated one-word and list-item labels', async () => {
  const text = `**Storage.** The service writes one row per account.

**Read path.** The endpoint returns that row.

- **Generation.** A script creates the first row.
- **Editing.** An admin can replace the row.
- **Rendering.** The page shows the saved text.`;
  assert.equal(finding(await lint(text), 'label-led-explanation')?.severity, 'error');
});

test('the public paired dataset rejects every difficult version and accepts every fixed version', async () => {
  for (const sample of await strictCases()) {
    const bad = await lint(sample.bad);
    for (const rule of sample.expectedRules) {
      assert.ok(finding(bad, rule), `${sample.id}: expected ${rule}`);
    }
    assert.deepEqual(await lint(sample.fixed), [], `${sample.id}: fixed text must pass`);
  }
});
