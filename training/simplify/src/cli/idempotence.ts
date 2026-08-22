// Idempotence benchmark: feed untouched human prose to a served model and
// measure how much it changes text that needs no work.
//
// v7 rewrote 72% of the phrasing in clean human prose and cut 29% of its words, and the
// base model was already doing most of that before training. This freezes that
// measurement so a later run can be compared against it.
//
//   npx tsx src/cli/idempotence.ts --arm v7 --n 120 --k 3
//
// Resumable: rows already in the output file are skipped, so an interrupted
// run continues where it stopped instead of starting over.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    arm: { type: 'string', default: 'v7' },
    n: { type: 'string', default: '120' },
    k: { type: 'string', default: '3' },
    seed: { type: 'string', default: '42' },
    url: { type: 'string', default: process.env.SIMPLIFY_SERVE_URL ?? 'http://127.0.0.1:8000' },
    out: { type: 'string' },
    workers: { type: 'string', default: '4' },
    minWords: { type: 'string', default: '150' },
    maxWords: { type: 'string', default: '1800' },
  },
});

const arm = values.arm as string;
const limit = Number(values.n);
const samples = Number(values.k);
const baseSeed = Number(values.seed);
const base = (values.url as string).replace(/\/$/, '');
const outPath = (values.out as string) ?? `runs/idem-${arm}.jsonl`;

interface Row { messages: { role: string; content: string }[]; sourceId: string }
const rows = readFileSync('runs/human-pairs-export/train.jsonl', 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as Row);

const system = rows[0].messages.find((m) => m.role === 'system')?.content ?? '';
const wordCount = (t: string) => t.split(/\s+/).filter((w) => w !== '').length;

const seen = new Set<string>();
const pool: { id: string; text: string }[] = [];
for (const row of rows) {
  if (seen.has(row.sourceId)) continue;
  seen.add(row.sourceId);
  const text = row.messages.find((m) => m.role === 'assistant')?.content?.trim() ?? '';
  const n = wordCount(text);
  if (n < Number(values.minWords) || n > Number(values.maxWords)) continue;
  pool.push({ id: row.sourceId, text });
}

// Evenly spaced over a sorted list rather than the first N. sourceId sorts by
// author, so a contiguous slice would hand the whole sample to one writer.
pool.sort((a, b) => a.id.localeCompare(b.id));
const step = Math.max(1, Math.floor(pool.length / limit));
const picked = pool.filter((_, i) => i % step === 0).slice(0, limit);

// k samples per document at a fixed seed per sample. One draw per document
// cannot tell a real change from sampling noise, and this benchmark exists to
// be compared against later runs.
const jobs = picked.flatMap((doc) => Array.from({ length: samples }, (_, s) => ({ ...doc, sample: s })));

const done = new Set<string>();
if (existsSync(outPath)) {
  for (const line of readFileSync(outPath, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    const row = JSON.parse(line) as { id: string };
    done.add(row.id);
  }
}
const todo = jobs.filter((j) => !done.has(`${j.id}#${j.sample}`));
console.error(`${pool.length} eligible, ${picked.length} sampled x ${samples} draws = ${jobs.length}; ${done.size} already done, ${todo.length} to run`);

async function rewrite(text: string, seed: number): Promise<string> {
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: arm,
      temperature: 0.7,
      top_p: 0.8,
      seed,
      max_tokens: 4096,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Simplify this:\n\n${text}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  return body.choices[0]?.message?.content ?? '';
}

let finished = 0;
let cursor = 0;
await Promise.all(
  Array.from({ length: Number(values.workers) }, async () => {
    while (cursor < todo.length) {
      const job = todo[cursor++];
      try {
        const output = await rewrite(job.text, baseSeed + job.sample);
        // Appended per row so an interrupted run keeps everything it collected.
        appendFileSync(outPath, `${JSON.stringify({ id: `${job.id}#${job.sample}`, input: job.text, output })}\n`, 'utf8');
      } catch (error) {
        console.error(`FAILED ${job.id}#${job.sample}: ${error instanceof Error ? error.message : String(error)}`);
      }
      finished += 1;
      if (finished % 25 === 0) console.error(`  ${finished}/${todo.length}`);
    }
  }),
);
console.error(`done: ${outPath}`);
