import { readFile } from 'node:fs/promises';
import { Linter, resolveConfig, type ParsedSentence, type Parser } from 'writinglint-core';
import { recommended } from 'writinglint-rulepack-ai-style';

interface RecordLine { family: string; text: string; gold: ParsedSentence; predicted: ParsedSentence }
class MutableParser implements Parser {
  sentence!: ParsedSentence;
  async parse(): Promise<ParsedSentence[]> { return [this.sentence]; }
}

const records = (await readFile(process.argv[2]!, 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as RecordLine);
const ids = new Set([
  'ai-style/rule-of-three', 'ai-style/negative-parallelism', 'ai-style/corrective-antithesis',
  'ai-style/participial-appendage', 'ai-style/copula-avoidance', 'ai-style/light-verb-role',
  'ai-style/vague-attribution', 'ai-style/throat-clearing', 'ai-style/passive-actor-hiding',
  'ai-style/false-agency',
]);
const resolved = resolveConfig(recommended);
const config = { ...resolved, rules: new Map([...resolved.rules].filter(([id]) => ids.has(id))) };
const parser = new MutableParser();
const linter = new Linter(parser);
let tp = 0, fp = 0, fn = 0, correct = 0, decisions = 0, exact = 0;
let invalidPredictions = 0;
const byRule: Record<string, { tp: number; fp: number; fn: number }> = {};
for (const id of ids) byRule[id] = { tp: 0, fp: 0, fn: 0 };

for (const record of records) {
  parser.sentence = record.gold;
  const gold = new Set((await linter.lint(record.text, config)).lints.map((lint) => lint.ruleId));
  parser.sentence = record.predicted;
  let predicted = new Set<string>();
  try {
    predicted = new Set((await linter.lint(record.text, config)).lints.map((lint) => lint.ruleId));
  } catch (error) {
    invalidPredictions++;
    console.error(JSON.stringify({ family: record.family, text: record.text, invalidPrediction: String(error) }));
  }
  if ([...ids].every((id) => gold.has(id) === predicted.has(id))) exact++;
  for (const id of ids) {
    const target = gold.has(id), output = predicted.has(id);
    decisions++;
    if (target === output) correct++;
    if (target && output) { tp++; byRule[id]!.tp++; }
    else if (!target && output) { fp++; byRule[id]!.fp++; }
    else if (target && !output) { fn++; byRule[id]!.fn++; }
  }
}
const precision = tp / Math.max(tp + fp, 1), recall = tp / Math.max(tp + fn, 1);
console.log(JSON.stringify({
  sentences: records.length, invalidPredictions,
  decisionAccuracy: correct / decisions, exactSentenceAccuracy: exact / records.length,
  precision, recall, f1: 2 * precision * recall / Math.max(precision + recall, 1e-12), tp, fp, fn, byRule,
}, null, 2));
