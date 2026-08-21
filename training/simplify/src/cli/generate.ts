import { parseArgs } from 'node:util';

import { run } from '@nikhilverma/durably';

import { durablyDir, loadConfig } from '../lib/env.ts';
import { totalSpentUsd } from '../lib/openrouter.ts';
import { generateSources } from '../workflows/generate.ts';

const { values } = parseArgs({
  options: {
    count: { type: 'string', default: '4' },
    batch: { type: 'string', default: 'batch-001' },
    budget: { type: 'string', default: '10' },
  },
});

const count = Number(values.count);
const batch = values.batch as string;
const config = loadConfig();

console.log(`generate: count=${count} batch=${batch}`);
console.log(`ledger: $${totalSpentUsd().toFixed(4)} spent of $${config.capUsd} global cap`);

const result = await run(
  generateSources,
  { count, batch },
  {
    key: `generate-${batch}-${count}`,
    dir: durablyDir,
    checkpointEvery: 1,
    budget: { usd: Number(values.budget) },
    onStep: (e) => {
      if (e.status === 'completed' || e.status === 'failed' || e.status === 'retrying') {
        console.log(`  [${e.status}] ${e.label} (attempt ${e.attempt}${e.ms !== undefined ? `, ${e.ms}ms` : ''})`);
      }
    },
  },
);

console.log(JSON.stringify(result, null, 2));
console.log(`ledger after: $${totalSpentUsd().toFixed(4)}`);
