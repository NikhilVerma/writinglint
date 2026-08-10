import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const missing = '__slopsift_intentionally_missing__/**/*.md';
const sloppy = fileURLToPath(new URL('./fixtures/high-confidence.md', import.meta.url));
const compressedTechnical = [1, 2, 3, 4, 5, 6].map((index) =>
  fileURLToPath(new URL(`./fixtures/compressed-technical-${index}.ts`, import.meta.url)));

function run(...args: string[]) {
  return spawnSync(process.execPath, ['--conditions=source', '--import', 'tsx', cli, ...args], {
    encoding: 'utf8',
  });
}

function runWithInput(input: string, ...args: string[]) {
  return spawnSync(process.execPath, ['--conditions=source', '--import', 'tsx', cli, ...args], {
    encoding: 'utf8',
    input,
  });
}

function parsedStandardFixture(): object {
  const ruleIds = [
    ...Array.from({ length: 14 }, (_, index) => `1.${index + 1}`),
    ...Array.from({ length: 2 }, (_, index) => `2.${index + 1}`),
    ...Array.from({ length: 7 }, (_, index) => `3.${index + 1}`),
    ...Array.from({ length: 5 }, (_, index) => `4.${index + 1}`),
    ...Array.from({ length: 5 }, (_, index) => `5.${index + 1}`),
    ...Array.from({ length: 6 }, (_, index) => `6.${index + 1}`),
    ...Array.from({ length: 3 }, (_, index) => `7.${index + 1}`),
    ...Array.from({ length: 7 }, (_, index) => `8.${index + 1}`),
    ...Array.from({ length: 4 }, (_, index) => `9.${index + 1}`),
  ];
  const entry = (headword: string, approved: boolean, index: number) => ({
    headword,
    approved,
    partOfSpeech: approved ? 'noun' : 'verb',
    formsText: null,
    source: { ref: `#/tables/${index}`, page: 149 + (index % 275) },
  });
  return {
    schemaVersion: 1,
    parserVersion: 'cli-test',
    source: { filename: 'local.pdf', pages: 434, doclingJsonSha256: 'b'.repeat(64) },
    writingRules: {
      sections: Array.from({ length: 9 }, (_, index) => ({ number: index + 1 })),
      rules: ruleIds.map((id) => ({ id })),
    },
    dictionary: {
      stats: { tables: 275, entries: 2190, approvedEntries: 875 },
      entries: [
        ...Array.from({ length: 875 }, (_, index) => entry(`APPROVED${index}`, true, index)),
        entry('utilize', false, 875),
        ...Array.from({ length: 1314 }, (_, index) => entry(`unapproved${index}`, false, index + 876)),
      ],
    },
  };
}

test('unmatched patterns fail loudly by default', () => {
  const result = run(missing);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no supported files matched/);
  assert.match(result.stderr, /--no-error-on-unmatched-pattern/);
});

test('unmatched patterns can be optional without loading the model', () => {
  const result = run(missing, '--no-error-on-unmatched-pattern', '--format', 'json');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
});

test('exit-zero neutralizes lint findings but not runtime failures', () => {
  const failing = run(sloppy, '--level', 'error');
  assert.equal(failing.status, 1, failing.stderr);

  const advisory = run(sloppy, '--level', 'error', '--exit-zero');
  assert.equal(advisory.status, 0, advisory.stderr);
  assert.match(advisory.stdout, /error/);

  const runtimeFailure = run(missing, '--exit-zero');
  assert.equal(runtimeFailure.status, 2);
});

test('GitHub format emits native annotations for CI', () => {
  const result = run(sloppy, '--level', 'error', '--format', 'github');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /::error file=.*high-confidence\.md,line=\d+,col=\d+,endLine=\d+,endColumn=\d+,title=ai-style\//);
});

test('--rulepack asd-ste100 selects the technical-English checks and reports coverage', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopsift-ste100-'));
  try {
    const file = join(directory, 'manual.md');
    writeFileSync(file, "Don't open the valve; inspect the seal.\n");
    const result = run(file, '--rulepack', 'asd-ste100', '--format', 'json', '--exit-zero');
    assert.equal(result.status, 0, result.stderr);
    const [output] = JSON.parse(result.stdout) as Array<{
      messages: Array<{ ruleId: string }>;
      standardAssessment?: {
        standard: string;
        issue: number;
        status: string;
        automatedRuleFindings: number;
      };
    }>;
    assert.deepEqual(
      new Set(output?.messages.map((message) => message.ruleId)),
      new Set(['technical-english/no-contractions', 'technical-english/no-semicolon']),
    );
    assert.deepEqual(output?.standardAssessment, {
      ...output?.standardAssessment,
      standard: 'ASD-STE100',
      issue: 9,
      status: 'nonconformant',
      automatedRuleFindings: 2,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a clean automated ASD-STE100 run remains review-required', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopsift-ste100-clean-'));
  try {
    const file = join(directory, 'manual.md');
    writeFileSync(file, 'Open the valve. Inspect the seal.\n');
    const result = run(file, '--rulepack', 'asd-ste100', '--format', 'json');
    assert.equal(result.status, 0, result.stderr);
    const [output] = JSON.parse(result.stdout) as Array<{
      standardAssessment?: { status: string; automatedRuleFindings: number };
    }>;
    assert.equal(output?.standardAssessment?.status, 'review-required');
    assert.equal(output?.standardAssessment?.automatedRuleFindings, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('--technical-mode applies the 20-word procedural limit', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopsift-ste100-mode-'));
  try {
    const file = join(directory, 'procedure.md');
    writeFileSync(file, 'Inspect the primary hydraulic pump housing carefully before you disconnect the pressure line from the forward service manifold during scheduled maintenance.\n');
    const descriptive = run(file, '--rulepack', 'asd-ste100', '--format', 'json', '--exit-zero');
    const procedural = run(
      file,
      '--rulepack', 'asd-ste100',
      '--technical-mode', 'procedural',
      '--format', 'json',
      '--exit-zero',
    );
    const [descriptiveOutput] = JSON.parse(descriptive.stdout) as Array<{ messages: Array<{ ruleId: string }> }>;
    const [proceduralOutput] = JSON.parse(procedural.stdout) as Array<{ messages: Array<{ ruleId: string }> }>;
    assert.equal(descriptiveOutput?.messages.some((message) => message.ruleId.endsWith('/sentence-length')), false);
    assert.equal(proceduralOutput?.messages.some((message) => message.ruleId.endsWith('/sentence-length')), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('warning-only technical findings remain review-required', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopsift-ste100-warning-'));
  try {
    const file = join(directory, 'procedure.md');
    writeFileSync(file, 'Inspect the primary hydraulic pump housing carefully before you disconnect the pressure line from the forward service manifold during scheduled maintenance.\n');
    const result = run(
      file,
      '--rulepack', 'asd-ste100',
      '--technical-mode', 'procedural',
      '--format', 'json',
      '--exit-zero',
    );
    assert.equal(result.status, 0, result.stderr);
    const [output] = JSON.parse(result.stdout) as Array<{
      messages: Array<{ ruleId: string; level: string }>;
      standardAssessment?: { status: string; automatedRuleFindings: number };
    }>;
    assert.ok(output?.messages.some(({ ruleId, level }) => ruleId.endsWith('/sentence-length') && level === 'warn'));
    assert.equal(output?.standardAssessment?.status, 'review-required');
    assert.equal(output?.standardAssessment?.automatedRuleFindings, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('technical findings in source comments retain exact original ranges', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopsift-ste100-source-range-'));
  try {
    const file = join(directory, 'manual.ts');
    const source = "const ready = true;\n// Don't open the valve; inspect the seal.\n";
    writeFileSync(file, source);
    const result = run(file, '--rulepack', 'asd-ste100', '--format', 'json', '--exit-zero');
    assert.equal(result.status, 0, result.stderr);
    const [output] = JSON.parse(result.stdout) as Array<{
      messages: Array<{ ruleId: string; start: number; end: number; text: string; line: number }>;
    }>;
    const messages = output?.messages ?? [];
    assert.deepEqual(new Set(messages.map(({ text }) => text)), new Set(["Don't", ';']));
    for (const message of messages) {
      assert.equal(source.slice(message.start, message.end), message.text);
      assert.equal(message.line, 2);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('--rulepack can combine ASD-STE100 with the default AI-style rules', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopsift-rulepacks-'));
  try {
    const file = join(directory, 'manual.md');
    writeFileSync(file, "Don't open the valve; inspect the seal.\n");
    const result = run(
      file,
      '--rulepack', 'ai-style',
      '--rulepack', 'asd-ste100',
      '--format', 'json',
      '--exit-zero',
    );
    assert.equal(result.status, 0, result.stderr);
    const [output] = JSON.parse(result.stdout) as Array<{
      messages: Array<{ ruleId: string }>;
    }>;
    assert.ok(output?.messages.some((message) => message.ruleId.startsWith('technical-english/')));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('unknown rulepacks fail before loading the model', () => {
  const result = run('--rulepack', 'official-magic');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown rulepack: official-magic/);
});

test('--rulepack requires a value', () => {
  const result = run('--rulepack');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--rulepack requires a value/);
});

test('--technical-standard-data validates local parser output and enables dictionary checks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopsift-ste100-data-'));
  try {
    const file = join(directory, 'manual.md');
    const standard = join(directory, 'parsed-standard.json');
    writeFileSync(file, 'Utilize the approved tool.');
    writeFileSync(standard, JSON.stringify(parsedStandardFixture()));
    const result = run(
      file,
      '--rulepack', 'asd-ste100',
      '--technical-standard-data', standard,
      '--format', 'json',
      '--exit-zero',
    );
    assert.equal(result.status, 0, result.stderr);
    const [output] = JSON.parse(result.stdout) as Array<{
      messages: Array<{ ruleId: string; text: string }>;
      standardAssessment: {
        standardData: { loaded: boolean; fingerprint: string };
        executedRules: string[];
      };
    }>;
    assert.ok(output?.messages.some(({ ruleId, text }) =>
      ruleId === 'technical-english/dictionary-word-approval' && text === 'Utilize'));
    assert.equal(output?.standardAssessment.standardData.loaded, true);
    assert.equal(output?.standardAssessment.standardData.fingerprint, `sha256:${'b'.repeat(64)}`);
    assert.deepEqual(output?.standardAssessment.executedRules.slice(-2), ['1.1', '1.2']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('--technical-standard-data cannot silently run without the technical rulepack', () => {
  const result = run('--technical-standard-data', 'anything.json');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /requires --rulepack asd-ste100/);
});

test('compressed technical comment regressions all produce a default warning', () => {
  const result = run(...compressedTechnical, '--format', 'json', '--exit-zero');
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as Array<{
    filePath: string;
    messages: Array<{ ruleId: string; level: string }>;
  }>;
  assert.equal(output.length, compressedTechnical.length);
  const expectedRules = [
    'ai-style/implementation-detail-pileup',
    'ai-style/implementation-detail-pileup',
    'ai-style/implementation-detail-pileup',
    'ai-style/negative-contrast',
    'ai-style/agentless-rationale',
    'ai-style/implementation-detail-pileup',
  ];
  for (const [index, entry] of output.entries()) {
    assert.ok(
      entry.messages.some((message) =>
        message.ruleId === expectedRules[index] && message.level === 'warn'),
      `${entry.filePath} should report ${expectedRules[index]}`,
    );
  }
});

test('Stop-hook CLI turns a warning into a cross-agent continuation decision', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopsift-hook-cli-'));
  try {
    const result = runWithInput(JSON.stringify({
      session_id: 'cli-hook-test',
      turn_id: 'turn-1',
      hook_event_name: 'Stop',
      stop_hook_active: false,
      last_assistant_message: 'Kept modest deliberately: the win comes from narrower prompts, not from saturating the model gate.',
    }), 'hook', 'stop', '--state-dir', directory);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as { decision?: string; reason?: string };
    assert.equal(output.decision, 'block');
    assert.match(output.reason ?? '', /ai-style\/agentless-rationale/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Stop-hook CLI fails open with valid JSON when its input is malformed', () => {
  const result = runWithInput('{broken', 'hook', 'stop');
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as { systemMessage?: string };
  assert.match(output.systemMessage ?? '', /could not validate/);
});

test('Stop-hook CLI rejects options whose values are missing', () => {
  const result = run('hook', 'stop', '--max-retries');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--max-retries requires a value/);
});

test('agent demo exercises the same reject-then-accept decision as the plugin', () => {
  const result = run('agent', 'demo', '--json');
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as {
    ok?: boolean;
    rejectedDraft?: { decision?: string };
    acceptedRewrite?: { systemMessage?: string };
  };
  assert.equal(output.ok, true);
  assert.equal(output.rejectedDraft?.decision, 'block');
  assert.match(output.acceptedRewrite?.systemMessage ?? '', /accepted the response after 1 automatic rewrite/);
});

test('agent doctor rejects an unknown host before loading the model', () => {
  const result = run('agent', 'doctor', '--host', 'unknown');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown agent host/);
});

test('a large Markdown table does not abort a multi-file JSON run', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopsift-table-'));
  try {
    const table = [
      '| Rule | Description | Example |',
      '| --- | --- | --- |',
      ...Array.from(
        { length: 45 },
        (_, index) => `| rule-${index} | This short cell explains local behavior number ${index} without becoming a prose sentence | This example remains deliberately brief and concrete |`,
      ),
    ].join('\n');
    const tableFile = join(directory, 'README.md');
    writeFileSync(tableFile, table);

    const result = run(tableFile, sloppy, '--format', 'json', '--exit-zero');
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as Array<{
      filePath: string;
      messages: Array<{ ruleId: string }>;
      wordCount: number;
    }>;
    assert.equal(output.length, 2);
    assert.ok(output.find((entry) => entry.filePath === tableFile)?.wordCount! > 300);
    assert.ok(output.find((entry) => entry.filePath.endsWith('high-confidence.md'))?.messages.length);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('an explicitly selected supported file reports zero extracted prose', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopsift-empty-'));
  try {
    const codeFile = join(directory, 'empty.ts');
    writeFileSync(codeFile, 'export const answer = 42;\n');

    const result = run(codeFile, '--ext', '.ts', '--format', 'json', '--exit-zero');
    assert.equal(result.status, 0, result.stderr);
    const [output] = JSON.parse(result.stdout) as Array<{
      messages: Array<{ ruleId: string; level: string }>;
      wordCount: number;
    }>;
    assert.equal(output?.wordCount, 0);
    assert.deepEqual(output?.messages.map(({ ruleId, level }) => ({ ruleId, level })), [{
      ruleId: 'slopsift/no-extractable-prose',
      level: 'info',
    }]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
