// Builds the second-round prompts: a draft plus what is still wrong with it.
//
//   npx tsx src/cli/fix-prompts.ts --limit 60 --domain prose --out fix-prompts-probe
//
// Best-of-n picks the luckiest of eight blind attempts, which is only worth
// something when the eight differ. On technical documents they do; on prose
// they do not, and prose is the slice that did not move. So stop sampling
// blind: lint the draft the model already produced, hand back the specific
// findings, and ask for a revision. That can beat every one of the eight,
// which blind sampling cannot.
//
// The findings are rendered WITHOUT rule ids or any product name. The model is
// being taught to write for a reader, not to satisfy a named linter, and a
// rule id in the prompt is the fastest way to teach it the opposite.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';

const { values } = parseArgs({
  options: {
    in: { type: 'string', default: 'train/data/v14/train.jsonl' },
    out: { type: 'string', default: 'fix-prompts' },
    prompt: { type: 'string', default: 'prompts/fixer-chat-v1.md' },
    domain: { type: 'string', default: '' },
    limit: { type: 'string', default: '0' },
    chunk: { type: 'string', default: '40' },
  },
});

interface Finding {
  level: string;
  message?: string;
  line?: number;
  text?: string;
}

const config = loadConfig();
const template = readFileSync(values.prompt as string, 'utf8');
const limit = Number(values.limit);

const pairs = readFileSync(values.in as string, 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as { messages: { role: string; content: string }[] })
  .map((r) => ({
    source: r.messages[1].content.split('Simplify this:\n\n')[1] ?? '',
    draft: r.messages[2].content,
  }));

// Domain comes from the same anchor test the reward uses, so a probe on "prose"
// means the same documents the report calls prose.
const wanted = pairs.filter((p) => {
  if (values.domain === '') return true;
  const terms = scoreRewrite({ source: p.source, output: p.source, sourceFindings: [], outputFindings: [], config: config.reward });
  return terms.domain === values.domain;
});
const rows = limit > 0 ? wanted.slice(0, limit) : wanted;

const out: string[] = [];
let alreadyClean = 0;
for (let start = 0; start < rows.length; start += Number(values.chunk)) {
  const batch = rows.slice(start, start + Number(values.chunk));
  const texts = new Map<string, string>();
  batch.forEach((r, i) => texts.set(`d-${start + i}`, r.draft));
  const findings = await lintTexts(texts, config);

  batch.forEach((r, i) => {
    const all = (findings.get(`d-${start + i}`) ?? []) as Finding[];
    // Paid levels only, matching what the loop is scored on. Showing findings
    // nothing checks would spend the revision on a bar that does not exist.
    const paid = all.filter((f) => f.level === 'error' || f.level === 'warn');
    if (paid.length === 0) {
      alreadyClean += 1;
      return;
    }
    const rendered = paid
      .map((f) => `- line ${f.line ?? '?'}: ${f.message ?? ''}${f.text ? `\n  offending text: "${f.text}"` : ''}`)
      .join('\n');
    const prompt = template
      .replace('{{FINDINGS}}', rendered)
      .replace('{{JUDGE_FEEDBACK}}', '')
      .replace('{{DRAFT}}', r.draft);
    out.push(JSON.stringify({ id: `d-${start + i}`, source: r.source, draft: r.draft, prompt }));
  });
  console.error(`[fix-prompts] ${Math.min(start + Number(values.chunk), rows.length)}/${rows.length} prompts ${out.length}`);
}

mkdirSync(runsDir, { recursive: true });
writeFileSync(path.join(runsDir, `${values.out}.jsonl`), out.map((l) => `${l}\n`).join(''), 'utf8');
console.log(
  `wrote ${out.length} prompts to runs/${values.out}.jsonl` +
    ` (${alreadyClean} drafts already had no paid findings and need no revision)`,
);
