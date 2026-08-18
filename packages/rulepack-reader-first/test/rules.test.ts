import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, test } from 'node:test';
import { Linter, resolveConfig, type Lint } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { readerFirst, recommended, strict } from '../src/index.js';

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

test('the pack exposes each implemented detector through every preset', () => {
  assert.deepEqual(Object.keys(readerFirst.rules).sort(), [
    'abstract-reference-chain',
    'aside-pileup',
    'fragment-chain',
    'label-led-explanation',
    'noun-pile',
    'paragraph-load',
    'sentence-load',
    'unexplained-initialism',
  ]);
  assert.deepEqual(Object.keys(readerFirst.configs ?? {}).sort(), ['ci', 'recommended', 'strict']);
});

test('sentence-load reports a long sentence with clauses and internal labels', async () => {
  const text = 'The scopePlanner reads `frameworkCriterionId`, and if the legacy root has no matching identifier, it normalizes the criterion name, compares every candidate, keeps the most recent result, and then returns the fallback tree so the next workflow can continue without losing prior context.';
  const match = finding(await lint(text), 'sentence-load');
  assert.ok(match);
  assert.match(match.message, /words.*clause breaks.*technical labels/);
  assert.deepEqual({ start: match.start, end: match.end }, { start: 0, end: text.length });
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
