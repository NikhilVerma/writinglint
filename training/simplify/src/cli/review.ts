import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';

import { readJsonl, trialFile } from '../lib/store.ts';

// Renders the judged pairs into a single local HTML page for human review.
// Nothing leaves the machine; the corpora stay gitignored.

const { values } = parseArgs({
  options: {
    trial: { type: 'string' },
    file: { type: 'string', default: 'human-review' },
  },
});

if (!values.trial) {
  console.error('usage: tsx review.ts --trial <name> [--file human-review|accepted|rejected|unresolved]');
  process.exit(2);
}
const trial = values.trial as string;
const file = values.file as string;

interface JudgeVerdict {
  model: string;
  response: {
    verdict: string;
    reasoning: string;
    missing_facts: string[];
    changed_claims: string[];
    added_claims: string[];
    lost_links_or_references: string[];
    modality_changes: string[];
  };
}

interface OutcomeRecord {
  sourceId: string;
  outcome: string;
  generatorModel: string | null;
  promptId: string | null;
  fixerModel: string;
  fixerRuns: number;
  original: string;
  rewrite: string | null;
  judges: JudgeVerdict[];
}

const records = readJsonl<OutcomeRecord>(trialFile(trial, `${file}.jsonl`));
if (records.length === 0) {
  console.error(`no records in ${file}.jsonl for ${trial}`);
  process.exit(1);
}

const escape = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const issueList = (label: string, items: string[]) =>
  items.length === 0 ? '' : `<p><strong>${label}:</strong></p><ul>${items.map((i) => `<li>${escape(i)}</li>`).join('')}</ul>`;

const judgeBlock = (j: JudgeVerdict) => `
  <div class="judge ${j.response.verdict}">
    <h4>${escape(j.model)} — <span class="verdict">${j.response.verdict.toUpperCase()}</span></h4>
    <p>${escape(j.response.reasoning)}</p>
    ${issueList('Missing facts', j.response.missing_facts)}
    ${issueList('Changed claims', j.response.changed_claims)}
    ${issueList('Added claims', j.response.added_claims)}
    ${issueList('Lost links/references', j.response.lost_links_or_references)}
    ${issueList('Modality changes', j.response.modality_changes)}
  </div>`;

const card = (r: OutcomeRecord, i: number) => `
<details class="pair" data-arm="${escape(r.fixerModel)}">
  <summary>#${i + 1} <code>${r.sourceId}</code> — gen: ${escape(r.generatorModel ?? '?')} · fixer: ${escape(r.fixerModel)} · ${r.fixerRuns} fix rounds
    · verdicts: ${r.judges.map((j) => j.response.verdict).join(' / ')}</summary>
  <div class="judges">${r.judges.map(judgeBlock).join('')}</div>
  <div class="cols">
    <div><h4>Original</h4><pre>${escape(r.original)}</pre></div>
    <div><h4>Rewrite</h4><pre>${escape(r.rewrite ?? '(none)')}</pre></div>
  </div>
</details>`;

const arms = [...new Set(records.map((r) => r.fixerModel))].sort();
const html = `<!doctype html>
<meta charset="utf-8">
<title>${trial} ${file} (${records.length})</title>
<style>
  body { font: 14px/1.5 -apple-system, sans-serif; margin: 2rem auto; max-width: 1300px; padding: 0 1rem; }
  .pair { border: 1px solid #ccc; border-radius: 6px; margin: 0.75rem 0; padding: 0.5rem 1rem; }
  summary { cursor: pointer; font-weight: 500; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  pre { white-space: pre-wrap; background: #f6f6f6; padding: 0.75rem; border-radius: 4px; font-size: 12px; }
  .judge { border-left: 4px solid #999; padding-left: 0.75rem; margin: 0.75rem 0; }
  .judge.pass { border-color: #2a2; } .judge.fail { border-color: #c33; }
  .verdict { font-weight: 700; }
  .filters button { margin-right: 0.5rem; }
</style>
<h1>${trial}: ${file} (${records.length} pairs)</h1>
<div class="filters">
  <button onclick="filter('')">all</button>
  ${arms.map((a) => `<button onclick="filter('${escape(a)}')">${escape(a)}</button>`).join('')}
</div>
${records.map(card).join('\n')}
<script>
function filter(arm) {
  document.querySelectorAll('.pair').forEach((el) => {
    el.style.display = !arm || el.dataset.arm === arm ? '' : 'none';
  });
}
</script>
`;

const out = trialFile(trial, `review-${file}.html`);
writeFileSync(out, html, 'utf8');
console.log(`${records.length} pairs -> ${out}`);
