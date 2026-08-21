import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { simplifyRoot } from '../lib/env.ts';
import { lengthRatio, withinLengthBand } from '../workflows/human-pairs.ts';

// Runs sample documents through the served simplifier and writes the rewrites
// next to a report, so you can inspect a batch instead of pasting one at a
// time into the playground page. Points at any OpenAI-compatible endpoint.
//   SIMPLIFY_ENDPOINT=https://…modal.run SIMPLIFY_API_KEY=… \
//     tsx simplify-run.ts --in ./drafts [--out runs/playground]
//     [--model slopsift-simplifier] [--concurrency 2] [--max-tokens 4096]

const { values } = parseArgs({
  options: {
    in: { type: 'string' },
    out: { type: 'string', default: 'runs/playground' },
    model: { type: 'string', default: 'slopsift-simplifier' },
    prompt: { type: 'string', default: 'rewrite-sft-v2' },
    concurrency: { type: 'string', default: '2' },
    'max-tokens': { type: 'string', default: '4096' },
  },
});

const endpoint = process.env.SIMPLIFY_ENDPOINT?.replace(/\/$/, '');
if (!endpoint) {
  console.error('set SIMPLIFY_ENDPOINT to the served base URL (no /v1 suffix)');
  process.exit(2);
}
if (!values.in) {
  console.error('usage: tsx simplify-run.ts --in <file-or-dir> [--out runs/playground]');
  process.exit(2);
}

const system = readFileSync(path.join(simplifyRoot, 'prompts', `${values.prompt}.md`), 'utf8').trim();
const inPath = path.resolve(values.in as string);
const files = statSync(inPath).isDirectory()
  ? readdirSync(inPath)
      .filter((name) => /\.(md|txt)$/.test(name))
      .map((name) => path.join(inPath, name))
  : [inPath];

if (files.length === 0) {
  console.error(`no .md or .txt files in ${inPath}`);
  process.exit(2);
}

const outDir = path.isAbsolute(values.out as string) ? (values.out as string) : path.join(simplifyRoot, values.out as string);
mkdirSync(outDir, { recursive: true });

const countWords = (text: string): number => (text.trim() === '' ? 0 : text.trim().split(/\s+/).length);

interface Report {
  file: string;
  sourceWords: number;
  rewriteWords: number;
  ratio: number;
  withinBand: boolean;
  ms: number;
}

async function simplify(file: string): Promise<Report> {
  const original = readFileSync(file, 'utf8');
  const started = Date.now();
  const res = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SIMPLIFY_API_KEY ?? ''}`,
    },
    body: JSON.stringify({
      model: values.model,
      temperature: 0.7,
      top_p: 0.8,
      max_tokens: Number(values['max-tokens']),
      // Training ran with thinking off; matching it here keeps Qwen3 from
      // prefixing every answer with an empty <think> block.
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Simplify this:\n\n${original.trim()}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${path.basename(file)}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  const rewrite = body.choices[0].message.content.trim();
  writeFileSync(path.join(outDir, path.basename(file)), `${rewrite}\n`, 'utf8');
  const sourceWords = countWords(original);
  const rewriteWords = countWords(rewrite);
  return {
    file: path.basename(file),
    sourceWords,
    rewriteWords,
    ratio: lengthRatio(sourceWords, rewriteWords),
    withinBand: withinLengthBand(sourceWords, rewriteWords),
    ms: Date.now() - started,
  };
}

const reports: Report[] = [];
const queue = [...files];
const workers = Array.from({ length: Math.max(1, Number(values.concurrency)) }, async () => {
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    try {
      const report = await simplify(file);
      reports.push(report);
      const flag = report.withinBand ? '' : '  <- outside length band';
      console.log(
        `${report.file}: ${report.sourceWords} -> ${report.rewriteWords} words ` +
          `(${report.ratio.toFixed(2)}x, ${(report.ms / 1000).toFixed(1)}s)${flag}`,
      );
    } catch (error) {
      console.error(String(error));
    }
  }
});
await Promise.all(workers);

writeFileSync(
  path.join(outDir, 'report.json'),
  `${JSON.stringify({ endpoint, model: values.model, prompt: values.prompt, reports }, null, 2)}\n`,
  'utf8',
);
const offBand = reports.filter((r) => !r.withinBand).length;
console.log(`\n${reports.length} rewrites in ${outDir}; ${offBand} outside the 0.7-1.3 length band`);
