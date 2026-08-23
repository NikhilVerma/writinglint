// Collects a directory of hand-written teacher rewrites into the same shape
// best-of-n already consumes.
//
//   npx tsx src/cli/teacher-collect.ts --dir <batches> --out v16-samples
//   npx tsx src/cli/best-of-n.ts --in v16-samples --out train/data/v16/train.jsonl --min-cut 3
//
// Four data-side generations reached the same place because every one of them
// drew its targets from the base model's own distribution. best-of-n picks the
// tail of that distribution, and training on the tail moves the mean by a
// fraction of the gap. A teacher target is not from that distribution at all,
// which is the only thing that changes here.
//
// Nothing in the pipeline downstream should know or care where a target came
// from, so this writes `outputs: [text]` and hands the same gates the same
// job: faithfulness, echo, minimum cut, and the benchmark near-duplicate check.
// A teacher that drops a fact gets thrown out exactly like a bad sample does.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { runsDir } from '../lib/env.ts';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    out: { type: 'string', default: 'v16-samples' },
  },
});
if (values.dir === undefined) throw new Error('usage: teacher-collect --dir <batch root> [--out name]');

const root = path.resolve(values.dir);
// A batch root holds batch-NN directories; a single batch directory is also
// accepted, so the same tool works on the ceiling probe and on the full run.
const batches = readdirSync(root)
  .filter((d) => d.startsWith('batch-'))
  .map((d) => path.join(root, d));
const dirs = batches.length > 0 ? batches : [root];

const rows: string[] = [];
let missing = 0;
let empty = 0;
for (const dir of dirs) {
  const index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8')) as { file: string; id: string }[];
  for (const entry of index) {
    const out = path.join(dir, entry.file.replace(/\.md$/, '.out.md'));
    if (!existsSync(out)) {
      missing += 1;
      continue;
    }
    const text = readFileSync(out, 'utf8').trim();
    if (text === '') {
      empty += 1;
      continue;
    }
    rows.push(JSON.stringify({ id: entry.id, source: readFileSync(path.join(dir, entry.file), 'utf8'), outputs: [text] }));
  }
}

mkdirSync(runsDir, { recursive: true });
const dest = path.join(runsDir, `${values.out}.jsonl`);
writeFileSync(dest, rows.map((l) => `${l}\n`).join(''), 'utf8');
console.log(`wrote ${rows.length} teacher pairs to ${dest} from ${dirs.length} batches (${missing} not written yet, ${empty} empty)`);
