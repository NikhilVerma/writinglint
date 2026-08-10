import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ASD_STE100_ISSUE_9_COVERAGE,
  parseAsdSte100Issue9StandardData,
  technicalEnglish,
} from 'writinglint-rulepack-technical-english';

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

const inputOption = option(process.argv.slice(2), '--input');
if (!inputOption) throw new Error('--input <parsed-standard-json> is required.');
const input = resolve(inputOption);
const standardData = parseAsdSte100Issue9StandardData(JSON.parse(readFileSync(input, 'utf8')));

const parsedRuleIds = new Set<string>(standardData.rules);
const catalogueRuleIds = new Set(ASD_STE100_ISSUE_9_COVERAGE.ruleCoverage.map(({ rule }) => rule));
if (parsedRuleIds.size !== catalogueRuleIds.size
  || [...parsedRuleIds].some((rule) => !catalogueRuleIds.has(rule))) {
  throw new Error('The product coverage catalogue does not match the rule identifiers parsed from the standard.');
}

const productDetectors = new Set(Object.keys(technicalEnglish.rules).map((name) => `technical-english/${name}`));
for (const coverage of ASD_STE100_ISSUE_9_COVERAGE.ruleCoverage) {
  for (const detector of coverage.detectors) {
    if (!productDetectors.has(detector)) {
      throw new Error(`Rule ${coverage.rule} names a detector that the product does not provide: ${detector}.`);
    }
  }
}

console.log(`Validated ${standardData.rules.length} Issue 9 rules against the product catalogue.`);
console.log(`Validated ${standardData.terminology.entries.length} dictionary entries, including ${standardData.terminology.approvedEntries} approved entries.`);
console.log(`Validated ${productDetectors.size} product detectors against their standard references.`);
console.log(`Source fingerprint: sha256:${standardData.source.doclingJsonSha256}`);
