// WritingLint as a library. Run: npm install && npm run setup && npm start
import { Linter, resolveConfig } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { recommended } from 'writinglint-rulepack-ai-style';

const text =
  process.argv.slice(2).join(' ') ||
  "In today's landscape, this stands as a testament to clarity, not cleverness.";

const parser = await loadParser({ modelDir: './models/xsmall' });
const { lints } = await new Linter(parser).lint(text, resolveConfig(recommended));

console.log(`\n${lints.length} problem(s) in:\n  "${text}"\n`);
for (const l of lints) {
  console.log(`  [${l.ruleId}] ${l.message}`);
  console.log(`      “${l.text}”`);
}
