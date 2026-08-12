import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiStyle, CATEGORIES, CATEGORY_ORDER, RULE_METHODS, type RuleMethod } from 'writinglint-rulepack-ai-style';
import { CATEGORIES as READER_CATEGORIES, readerFirst } from 'writinglint-rulepack-reader-first';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = resolve(root, 'packages/slopsift-web');
const check = process.argv.includes('--check');
const packageJson = JSON.parse(
  await readFile(resolve(root, 'packages/slopsift/package.json'), 'utf8'),
) as { version: string };

const SITE = 'https://slopsift.dev';
const REPOSITORY = 'https://github.com/NikhilVerma/writinglint';
const SKILL = 'https://skills.sh/NikhilVerma/slopsift';
const MARKETPLACE = 'https://marketplace.visualstudio.com/items?itemName=NikhilVerma01.slopsift-vscode';
const SCHEMA_VERSION = '1.0.0';

const levelForConfidence = {
  high: 'error',
  medium: 'warn',
  low: 'info',
} as const;

const methodDetails: Record<RuleMethod, { label: string; description: string }> = {
  'dependency-graph': {
    label: 'Dependency graph',
    description: 'Matches grammatical relationships between words, not only their order or part of speech.',
  },
  'document-context': {
    label: 'Document context',
    description: 'Compares evidence across a paragraph, nearby sentences, or the complete document.',
  },
  lexical: {
    label: 'Text pattern',
    description: 'Matches a word, phrase, punctuation pattern, or other directly observable text signal.',
  },
};

const titleCase = (value: string): string => value
  .split('-')
  .map((part, index) => {
    if (part === 'ai') return 'AI';
    if (index && ['and', 'of', 'or'].includes(part)) return part;
    return part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part;
  })
  .join(' ');

const markdownSafe = (value: string): string => value
  .replace(/\s*—\s*/g, ', ')
  .replace(/\s*–\s*/g, '-');

const aiRules = Object.entries(aiStyle.rules).map(([name, rule]) => {
  const confidence = rule.meta.defaultConfidence ?? 'low';
  const method = RULE_METHODS[name as keyof typeof RULE_METHODS];
  if (!method) throw new Error(`missing RULE_METHODS metadata for ${name}`);
  const category = CATEGORIES[rule.meta.category];
  if (!category) throw new Error(`missing category metadata for ${name}: ${rule.meta.category}`);
  return {
    id: `ai-style/${name}`,
    name,
    title: titleCase(name),
    description: markdownSafe(rule.meta.docs.description),
    category: {
      id: category.id,
      label: category.label,
      description: markdownSafe(category.blurb),
    },
    confidence,
    defaultLevel: levelForConfidence[confidence],
    method,
    methodLabel: methodDetails[method].label,
    methodDescription: methodDetails[method].description,
    url: `${SITE}/rules/${name}/`,
    sourceUrl: `${REPOSITORY}/blob/main/packages/rulepack-ai-style/src/rules/${sourceFileFor(name)}`,
    reportUrl: `${REPOSITORY}/issues/new?template=false-positive.yml&title=${encodeURIComponent(`rule: ai-style/${name}`)}`,
  };
});

const readerMethods: Record<keyof typeof readerFirst.rules, RuleMethod> = {
  'noun-pile': 'dependency-graph',
  'paragraph-load': 'document-context',
  'sentence-load': 'document-context',
  'unexplained-initialism': 'document-context',
};

const readerRules = Object.entries(readerFirst.rules).map(([name, rule]) => {
  const confidence = rule.meta.defaultConfidence ?? 'low';
  const method = readerMethods[name as keyof typeof readerFirst.rules];
  const category = READER_CATEGORIES[rule.meta.category];
  if (!category) throw new Error(`missing reader-first category metadata for ${name}: ${rule.meta.category}`);
  return {
    id: `reader-first/${name}`,
    name,
    title: titleCase(name),
    description: markdownSafe(rule.meta.docs.description),
    category: {
      id: category.id,
      label: category.label,
      description: markdownSafe(category.blurb),
    },
    confidence,
    defaultLevel: levelForConfidence[confidence],
    method,
    methodLabel: methodDetails[method].label,
    methodDescription: methodDetails[method].description,
    url: `${SITE}/rules/${name}/`,
    sourceUrl: `${REPOSITORY}/blob/main/packages/rulepack-reader-first/src/rules/${name}.ts`,
    reportUrl: `${REPOSITORY}/issues/new?template=false-positive.yml&title=${encodeURIComponent(`rule: reader-first/${name}`)}`,
  };
});

const categoryOrder = [...CATEGORY_ORDER, ...Object.keys(READER_CATEGORIES)];
const rules = [...aiRules, ...readerRules].sort((a, b) => {
  const category = categoryOrder.indexOf(a.category.id) - categoryOrder.indexOf(b.category.id);
  return category || a.name.localeCompare(b.name);
});

function sourceFileFor(name: string): string {
  const grouped: Record<string, string> = {
    'significance-idioms': 'idioms.ts',
    'promo-idioms': 'idioms.ts',
    'chatbot-idioms': 'idioms.ts',
    'em-dash-overuse': 'formatting.ts',
    'mixed-quotes': 'formatting.ts',
    'generation-artifacts': 'formatting.ts',
    emoji: 'formatting.ts',
  };
  return grouped[name] ?? `${name}.ts`;
}

const allCategories = { ...CATEGORIES, ...READER_CATEGORIES };
const categories = categoryOrder
  .map((id) => allCategories[id])
  .filter((category): category is NonNullable<typeof category> => Boolean(category))
  .map((category) => ({
    id: category.id,
    label: category.label,
    description: markdownSafe(category.blurb),
    ruleCount: rules.filter((rule) => rule.category.id === category.id).length,
  }));

const catalog = {
  schemaVersion: SCHEMA_VERSION,
  packageVersion: packageJson.version,
  name: 'SlopSift rule catalogue',
  url: `${SITE}/rules/`,
  categories,
  rules,
};

const outputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${SITE}/schemas/slopsift-result-v1.schema.json`,
  title: 'SlopSift JSON output',
  description: 'Version 1 schema for the array emitted by slopsift --format json. Each JSON Lines record follows $defs.fileResult.',
  type: 'array',
  items: { $ref: '#/$defs/fileResult' },
  $defs: {
    fileResult: {
      type: 'object',
      additionalProperties: false,
      required: [
        'filePath',
        'messages',
        'errorCount',
        'warningCount',
        'infoCount',
        'wordCount',
        'findingsPerThousandWords',
      ],
      properties: {
        filePath: { type: 'string' },
        messages: {
          type: 'array',
          items: { $ref: '#/$defs/message' },
        },
        errorCount: { type: 'integer', minimum: 0 },
        warningCount: { type: 'integer', minimum: 0 },
        infoCount: { type: 'integer', minimum: 0 },
        wordCount: { type: 'integer', minimum: 0 },
        findingsPerThousandWords: { type: 'number', minimum: 0 },
      },
    },
    message: {
      type: 'object',
      additionalProperties: false,
      required: [
        'ruleId',
        'ruleUrl',
        'category',
        'severity',
        'level',
        'confidence',
        'start',
        'end',
        'text',
        'message',
        'line',
        'column',
        'endLine',
        'endColumn',
      ],
      properties: {
        ruleId: { type: 'string', pattern: '^[a-z0-9-]+/[a-z0-9-]+$' },
        ruleUrl: { type: 'string', format: 'uri' },
        category: { type: 'string' },
        severity: { type: 'integer', minimum: 0, maximum: 2 },
        level: { enum: ['info', 'warn', 'error'] },
        confidence: { enum: ['low', 'medium', 'high'] },
        start: { type: 'integer', minimum: 0 },
        end: { type: 'integer', minimum: 0 },
        text: { type: 'string' },
        message: { type: 'string' },
        line: { type: 'integer', minimum: 1 },
        column: { type: 'integer', minimum: 1 },
        endLine: { type: 'integer', minimum: 1 },
        endColumn: { type: 'integer', minimum: 1 },
        suggestion: { type: 'string' },
        assumptions: {
          type: 'array',
          items: { type: 'string' },
        },
        evidence: {
          type: 'array',
          items: { $ref: '#/$defs/evidence' },
        },
        fix: {
          type: 'object',
          additionalProperties: false,
          required: ['range', 'text'],
          properties: {
            range: {
              type: 'array',
              prefixItems: [
                { type: 'integer', minimum: 0 },
                { type: 'integer', minimum: 0 },
              ],
              minItems: 2,
              maxItems: 2,
            },
            text: { type: 'string' },
          },
        },
      },
    },
    evidence: {
      type: 'object',
      additionalProperties: false,
      required: ['kind'],
      properties: {
        kind: { type: 'string' },
        message: { type: 'string' },
        span: {
          type: 'object',
          additionalProperties: false,
          required: ['start', 'end'],
          properties: {
            start: { type: 'integer', minimum: 0 },
            end: { type: 'integer', minimum: 0 },
          },
        },
        data: {
          type: 'object',
          additionalProperties: { type: ['string', 'number', 'boolean', 'null'] },
        },
      },
    },
  },
};

const ruleListMarkdown = rules
  .map((rule) => `- [${rule.id}](${rule.url}): ${rule.description} (${rule.defaultLevel}, ${rule.methodLabel.toLowerCase()})`)
  .join('\n');

const llms = `# SlopSift

> SlopSift is a local-first linter for recognizable AI-writing habits. It uses a compact dependency parser and named rules. It reports writing patterns; it does not determine authorship.

## Use SlopSift

- [Browser editor](${SITE}/editor/): Lint Markdown or plain text locally in the browser.
- [Documentation](${SITE}/docs/): Install the CLI, understand findings, and configure CI.
- [Rule catalogue](${SITE}/rules/): Read every rule, its evidence source, and default level.
- [GitHub Actions guide](${SITE}/docs/github-actions/): Add advisory or blocking checks to a repository.
- [npm package](https://www.npmjs.com/package/slopsift): Run with \`bunx slopsift .\` or \`npx slopsift .\`.
- [VS Code extension](${MARKETPLACE}): Show findings in the Problems panel.
- [Agent Skill](${SKILL}): Install SlopSift instructions for compatible coding agents.
- [Source code](${REPOSITORY}): WritingLint engine, SlopSift product, model notes, and tests.

## Agent-ready usage

- CLI: \`npx slopsift . --rulepack ai-style --rulepack reader-first\`
- API: import \`createSlopSift\`, then pass \`rulepacks: ['ai-style', 'reader-first']\` to \`lintSource\`.
- Stop hook executable: \`npx --yes slopsift@latest hook stop --rulepack ai-style --rulepack reader-first --feedback compact\` reads a hook event from stdin and returns one JSON decision. Running it does not install a hook.

## Install agent Stop hooks

When asked to set up SlopSift, detect which supported agent is installed and use its maintained plugin. Plugin installation registers the Stop hook; do not replace the user's settings file or existing hooks.

Claude Code:

\`\`\`sh
claude plugin marketplace add NikhilVerma/writinglint
claude plugin install --scope user slopsift@slopsift
\`\`\`

Codex:

\`\`\`sh
codex plugin marketplace add NikhilVerma/writinglint
codex plugin add slopsift@slopsift
\`\`\`

After installation, start a new agent session, approve the hook if the client asks, and run one known-bad response followed by a clean rewrite. Do not enable dirty-tree or transcript checks unless the user requests them. See the [complete agent reference](${SITE}/llms-full.txt) for validation and standalone configuration.

## Machine-readable references

- [Complete agent reference](${SITE}/llms-full.txt): CLI contract, exit codes, inputs, and all rules.
- [Rule catalogue JSON](${SITE}/rules/index.json): Versioned rule metadata.
- [JSON output schema](${SITE}/schemas/slopsift-result-v1.schema.json): Schema for \`--format json\` and \`--format json-lines\`.

## Markdown

Send \`Accept: text/markdown\` when requesting the home page, documentation, privacy policy, rule catalogue, GitHub Actions guide, or an individual rule page.

## Optional

- [Privacy](${SITE}/privacy/): Local processing and network behavior.
- [Model card](${REPOSITORY}/blob/main/packages/slopsift/MODEL.md): Training, evaluation, weights, and limitations.
`;

const fullReference = `# SlopSift agent reference

SlopSift ${packageJson.version} is a deterministic, local-first linter for recognizable AI-writing habits. It parses grammatical relationships, runs named rules, and returns exact source ranges. A finding is an editorial signal, not evidence of authorship.

## CLI

\`\`\`sh
bunx slopsift .
npx slopsift "docs/**/*.md"
npx slopsift . --level info --format json --exit-zero
npx slopsift . --rulepack ai-style --rulepack reader-first
\`\`\`

Node.js 20 or newer is required. The npm package includes the compact parser weights. Normal CLI use does not require Python, an API key, or a hosted inference service.

## Inputs

- Markdown, MDX, reStructuredText, AsciiDoc, and plain text are linted as prose.
- HTML is linted as rendered text. Metadata, scripts, styles, templates, SVG, code blocks, and comments are excluded.
- Supported source files are linted through their comments.
- Dependencies, generated output, Git metadata, and paths ignored by \`.gitignore\` are skipped by default.

## Finding levels

- \`error\`: high-confidence, specific signature. Exits with status 1.
- \`warn\`: likely issue requiring editorial judgment. Reported by default.
- \`info\`: broad review candidate. Included with \`--level info\`.

\`--max-warnings 0\` makes warnings fail the command. \`--exit-zero\` keeps lint findings visible without returning status 1. Configuration and runtime failures still return status 2.

## Output formats

- \`stylish\`: human-readable terminal report.
- \`json\`: one JSON array. See [schema](${SITE}/schemas/slopsift-result-v1.schema.json).
- \`json-lines\`: one file result per line, following \`$defs.fileResult\` in the schema.
- \`github\`: GitHub Actions workflow annotations.

JSON messages include an ESLint-compatible numeric severity, SlopSift's textual level, confidence, exact range, rule URL, word count, and findings per thousand words.

## Rulepacks

The default rulepack is \`ai-style\`. The independent \`reader-first\` pack applies general simplified-technical-writing principles: introduce terms, show relationships, keep one main point visible, and remove unnecessary ornament. It does not include an external controlled dictionary or claim compliance with an external standard. Repeat \`--rulepack\` to combine packs. For agent responses, use both.

## In-process API

\`\`\`ts
import { createSlopSift } from 'slopsift';

const slopsift = await createSlopSift();
const result = await slopsift.lintSource('draft.md', text, {
  level: 'warning',
  rulepacks: ['ai-style', 'reader-first'],
});
\`\`\`

One \`SlopSift\` instance reuses its local parser. \`lintSource\` returns exact source ranges and does not upload the text.

## Stop hook

\`\`\`sh
npx --yes slopsift@latest hook stop --rulepack ai-style --rulepack reader-first --feedback compact
\`\`\`

Pass the Claude Code or Codex Stop event as JSON on stdin. The command writes one JSON decision to stdout. Compact feedback groups repeated findings, omits response locations that the model already has in context, and shows up to 100 findings by default. Use \`--feedback detailed\` for file-oriented diagnostics.

Running the command directly does not install a hook. For a user-level installation, use the maintained plugin for each installed host. These commands preserve other hooks and settings.

Claude Code:

\`\`\`sh
claude plugin marketplace add NikhilVerma/writinglint
claude plugin install --scope user slopsift@slopsift
\`\`\`

Codex:

\`\`\`sh
codex plugin marketplace add NikhilVerma/writinglint
codex plugin add slopsift@slopsift
\`\`\`

Start a new session after installation. Approve the hook if the client asks for trust. Test it with one response that should be rejected and one clean rewrite that should pass. Do not enable dirty-tree or transcript checks unless the user requests them.

## Exit codes

- \`0\`: accepted result, including lint findings when \`--exit-zero\` is set.
- \`1\`: findings crossed the configured error or warning threshold.
- \`2\`: invalid arguments, unmatched required patterns, configuration failure, model failure, or runtime failure.

## Agent workflow

1. Run SlopSift using the repository's existing package manager.
2. Use \`--format json --exit-zero\` for structured editorial review.
3. Inspect the exact range and surrounding paragraph.
4. Preserve facts, technical terms, modality, and the writer's voice.
5. Rerun the same command after editing.
6. Do not optimize for zero low-confidence findings.

Install the maintained [SlopSift Agent Skill](${SKILL}) for the complete editing procedure.

## Rule catalogue

${ruleListMarkdown}

## References

- [Documentation](${SITE}/docs/)
- [GitHub Actions guide](${SITE}/docs/github-actions/)
- [Rule catalogue JSON](${SITE}/rules/index.json)
- [Source code](${REPOSITORY})
- [Privacy](${SITE}/privacy/)
`;

const githubActionsGuide = `# Run SlopSift in GitHub Actions

SlopSift can block high-confidence writing tells, upload an advisory report, or lint only changed prose. The examples below pin the public npm release and require no repository secret.

## Block on high-confidence findings

\`\`\`yaml
name: SlopSift

on:
  pull_request:
    paths:
      - "**/*.md"
      - "**/*.mdx"
      - "**/*.txt"

permissions:
  contents: read

jobs:
  lint-writing:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Lint high-confidence writing tells
        run: npx --yes slopsift@${packageJson.version} . --quiet --format github
\`\`\`

\`--quiet\` reports errors only. The \`github\` formatter emits native workflow annotations at the exact source range.

## Upload an advisory report

\`\`\`yaml
name: SlopSift report

on:
  pull_request:

permissions:
  contents: read

jobs:
  review-writing:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Write a JSON Lines report
        run: npx --yes slopsift@${packageJson.version} . --level info --format json-lines --exit-zero > slopsift.jsonl
      - uses: actions/upload-artifact@v4
        with:
          name: slopsift-report
          path: slopsift.jsonl
\`\`\`

\`--exit-zero\` preserves status 2 for invalid arguments, unmatched required patterns, model failures, and runtime failures. Do not replace it with \`|| true\`, which hides broken runs.

## Lint changed files only

\`\`\`yaml
- name: Lint changed writing
  shell: bash
  env:
    BASE_SHA: \${{ github.event.pull_request.base.sha }}
  run: |
    mapfile -d '' files < <(
      git diff --name-only -z --diff-filter=ACMR "$BASE_SHA" HEAD -- \\
        "*.md" "*.mdx" "*.txt" "*.html" "*.ts" "*.tsx" "*.js" "*.jsx"
    )
    if (( \${#files[@]} )); then
      npx --yes slopsift@${packageJson.version} "\${files[@]}" --quiet --format github
    fi
\`\`\`

The null-delimited array preserves spaces in filenames. The command is skipped when no supported files changed.

## Exit codes

- \`0\`: accepted result, including findings under \`--exit-zero\`.
- \`1\`: findings crossed the configured threshold.
- \`2\`: arguments, file discovery, model loading, configuration, or runtime failed.

## Fork safety

These workflows need only \`contents: read\`. They do not use secrets and invoke a pinned public package. If the repository already keeps SlopSift as a development dependency, use the committed lockfile, \`npm ci\`, and \`npx slopsift\` instead.

## Machine-readable contracts

- [JSON output schema](${SITE}/schemas/slopsift-result-v1.schema.json)
- [Rule catalogue JSON](${SITE}/rules/index.json)
- [Rendered guide](${SITE}/docs/github-actions/)
`;

const pageMarkdown = {
  'index.md': `# SlopSift

SlopSift finds recognizable AI-writing habits in Markdown, prose, HTML, and source-code comments. It uses a compact dependency parser to follow grammatical relationships and runs named, deterministic rules locally.

- [Open the local editor](${SITE}/editor/)
- [Install and configure SlopSift](${SITE}/docs/)
- [Browse all rules](${SITE}/rules/)
- [Install from npm](https://www.npmjs.com/package/slopsift)
- [View the source](${REPOSITORY})

SlopSift checks writing patterns. It does not determine who or what wrote a document.
`,
  'docs.md': fullReference,
  'privacy.md': `# SlopSift privacy

SlopSift processes text locally.

- The CLI and VS Code extension include the parser weights and do not upload documents for normal linting.
- The browser downloads static model and runtime files, then runs inference on-device.
- The browser editor does not upload the text being edited.
- SlopSift has no account system and no document-storage service.
- GitHub issue reports are public. Only submit text you have permission to share.

[Full privacy page](${SITE}/privacy/)
`,
  'rules.md': `# SlopSift rule catalogue

SlopSift ${packageJson.version} includes ${rules.length} AI-style rules. Default levels derive from rule confidence: high is error, medium is warning, and low is info.

${ruleListMarkdown}

[Rule catalogue JSON](${SITE}/rules/index.json)
`,
  'github-actions.md': githubActionsGuide,
};

const files = new Map<string, string>([
  [resolve(web, 'src/generated/rules.json'), `${JSON.stringify(catalog, null, 2)}\n`],
  [resolve(web, 'public/rules/index.json'), `${JSON.stringify(catalog, null, 2)}\n`],
  [resolve(web, 'public/schemas/slopsift-result-v1.schema.json'), `${JSON.stringify(outputSchema, null, 2)}\n`],
  [resolve(root, 'packages/slopsift/rules/index.json'), `${JSON.stringify(catalog, null, 2)}\n`],
  [resolve(root, 'packages/slopsift/schema/slopsift-result-v1.schema.json'), `${JSON.stringify(outputSchema, null, 2)}\n`],
  [resolve(web, 'public/llms.txt'), llms],
  [resolve(web, 'public/llms-full.txt'), fullReference],
  [resolve(root, 'docs/slopsift-github-actions.md'), githubActionsGuide],
  ...Object.entries(pageMarkdown).map(([name, content]) => [
    resolve(web, 'public/markdown', name),
    content,
  ] as const),
  ...rules.map((rule) => [
    resolve(web, 'public/markdown/rules', `${rule.name}.md`),
    `# ${rule.id}

${rule.description}

- Default level: \`${rule.defaultLevel}\`
- Confidence: \`${rule.confidence}\`
- Evidence source: ${rule.methodLabel}
- Category: ${rule.category.label}

${rule.methodDescription}

[Rule page](${rule.url})
[Source](${rule.sourceUrl})
[Report a false positive or missed finding](${rule.reportUrl})
`,
  ] as const),
]);

let stale = false;
for (const [path, content] of files) {
  const current = await readFile(path, 'utf8').catch(() => undefined);
  if (current === content) continue;
  if (check) {
    console.error(`stale generated agent surface: ${path.slice(root.length + 1)}`);
    stale = true;
    continue;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  console.log(`generated ${path.slice(root.length + 1)}`);
}

await validateSkill();
if (stale) process.exitCode = 1;

async function validateSkill(): Promise<void> {
  const skillPath = resolve(root, 'skills/slopsift/SKILL.md');
  const skill = await readFile(skillPath, 'utf8');
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatter) throw new Error('skills/slopsift/SKILL.md has no YAML frontmatter');
  const name = frontmatter[1]!.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = frontmatter[1]!.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (name !== 'slopsift') throw new Error(`skill name must be slopsift, received ${name ?? 'nothing'}`);
  if (!description || description.length > 1024) throw new Error('skill description must contain 1-1024 characters');
  for (const flag of ['--level info', '--format json', '--exit-zero']) {
    if (!skill.includes(flag)) throw new Error(`skill is missing the maintained CLI example: ${flag}`);
  }
}
