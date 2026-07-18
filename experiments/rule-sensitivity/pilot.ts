import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  Linter,
  resolveConfig,
  type ParsedSentence,
  type Parser,
} from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { recommended } from 'writinglint-rulepack-ai-style';

const STRUCTURAL = new Set([
  'ai-style/rule-of-three',
  'ai-style/negative-parallelism',
  'ai-style/corrective-antithesis',
  'ai-style/participial-appendage',
  'ai-style/copula-avoidance',
  'ai-style/light-verb-role',
  'ai-style/vague-attribution',
  'ai-style/throat-clearing',
  'ai-style/passive-actor-hiding',
  'ai-style/false-agency',
]);

const RELATIONS = [
  'root', 'nsubj', 'obj', 'iobj', 'ccomp', 'xcomp', 'advcl', 'acl', 'amod',
  'advmod', 'obl', 'conj', 'cc', 'cop', 'det', 'nmod', 'case', 'mark',
];
const UPOS = ['NOUN', 'PROPN', 'VERB', 'AUX', 'ADJ', 'ADV', 'PRON', 'DET'];

interface Seed { family: string; text: string }
interface Entry {
  id: string;
  family: string;
  text: string;
  baselineRules: string[];
  tokenId: number;
  token: string;
  field: 'head' | 'deprel' | 'upos';
  from: string | number;
  to: string | number;
  changedRules: string[];
}

function seeds(): Seed[] {
  const out: Seed[] = [];
  const add = (family: string, text: string) => out.push({ family, text });

  for (const subject of ['Studies', 'Experts', 'Researchers', 'Critics', 'Observers', 'Analysts']) {
    for (const verb of ['suggest', 'argue', 'claim', 'report', 'predict']) {
      add('vague-attribution/bare', `${subject} ${verb} that the policy will fail.`);
      add('vague-attribution/determined', `The ${subject.toLowerCase()} ${verb} that the policy will fail.`);
    }
  }
  for (const gerund of ['showcasing', 'highlighting', 'underscoring', 'reflecting', 'demonstrating']) {
    add('participial/editorial', `The museum reopened, ${gerund} the city's industrial heritage.`);
    add('participial/narrative', `The mechanic stayed late, trying to repair the engine.`);
  }
  for (const noun of ['role', 'impact', 'contribution', 'influence']) {
    add('light-verb/positive', `The system plays a crucial ${noun} in daily operations.`);
    add('light-verb/direct', `The system directly improves daily operations.`);
  }
  for (const adjective of ['important', 'essential', 'notable', 'clear']) {
    add('throat-clearing/positive', `It is ${adjective} to note that the deadline moved.`);
    add('throat-clearing/direct', `The deadline moved to Friday.`);
  }
  for (const place of ['design', 'building', 'interface', 'garden']) {
    add('copula-avoidance/positive', `The ${place} serves as a symbol of resilience.`);
    add('copula-avoidance/plain', `The ${place} is a symbol of resilience.`);
  }
  for (const triple of [
    ['fast', 'clear', 'reliable'], ['vibrant', 'busy', 'diverse'],
    ['small', 'quiet', 'precise'], ['warm', 'open', 'welcoming'],
  ]) add('rule-of-three/positive', `The product is ${triple[0]}, ${triple[1]}, and ${triple[2]}.`);
  for (const pair of [['fast', 'clear'], ['small', 'reliable'], ['warm', 'open']])
    add('rule-of-three/pair', `The product is ${pair[0]} and ${pair[1]}.`);
  for (const [left, right] of [['clarity', 'cleverness'], ['evidence', 'instinct'], ['people', 'metrics']]) {
    add('corrective-antithesis/positive', `Choose ${left}, not ${right}.`);
    add('corrective-antithesis/negation', `I did not choose ${right}.`);
  }
  for (const adjective of ['fast', 'elegant', 'useful', 'accurate'])
    add('negative-parallelism/positive', `The tool is not only ${adjective} but also reliable.`);

  // Broader lexical and syntactic variation for the original eight rules.
  for (const subject of ['The platform', 'This method', 'The redesign', 'The proposal', 'The program']) {
    for (const [verb, role] of [
      ['plays', 'role'], ['has', 'impact'], ['makes', 'contribution'], ['exerts', 'influence'],
    ]) {
      for (const adjective of ['important', 'central', 'critical', 'significant'])
        add('light-verb/expanded', `${subject} ${verb} an ${adjective} ${role} in the final result.`);
    }
  }
  for (const claim of [
    'the deadline moved', 'the first test failed', 'the budget was cut',
    'the customer left', 'the parser missed the relation', 'the team changed course',
  ]) {
    for (const adjective of ['important', 'essential', 'useful', 'worthwhile', 'necessary']) {
      add('throat-clearing/expanded', `It is ${adjective} to note that ${claim}.`);
      add('throat-clearing/direct-expanded', `${claim[0]!.toUpperCase()}${claim.slice(1)}.`);
    }
  }
  for (const subject of ['The monument', 'The interface', 'The ritual', 'The policy', 'The archive', 'The garden']) {
    for (const complement of ['symbol of trust', 'testament to endurance', 'reflection of local values', 'bridge between generations']) {
      add('copula-avoidance/expanded', `${subject} serves as a ${complement}.`);
      add('copula-avoidance/plain-expanded', `${subject} is a ${complement}.`);
    }
  }
  for (const main of [
    'The library reopened', 'The company published the report', 'The city restored the station',
    'The team shipped the release', 'The gallery acquired the collection', 'The council approved the plan',
  ]) {
    for (const gerund of ['showcasing', 'highlighting', 'underscoring', 'reflecting', 'demonstrating', 'embodying'])
      add('participial/expanded', `${main}, ${gerund} its lasting importance.`);
  }
  for (const subject of ['Analysts', 'Reviewers', 'Commentators', 'Officials', 'Economists', 'Engineers']) {
    for (const verb of ['maintain', 'assert', 'warn', 'indicate', 'conclude', 'observe']) {
      add('vague-attribution/expanded-bare', `${subject} ${verb} that the current approach cannot scale.`);
      add('vague-attribution/expanded-specific', `The independent ${subject.toLowerCase()} ${verb} that the current approach cannot scale.`);
    }
  }
  for (const noun of ['service', 'interface', 'process', 'report', 'proposal', 'campaign']) {
    for (const [a, b, c] of [
      ['fast', 'clear', 'reliable'], ['simple', 'stable', 'predictable'],
      ['bold', 'modern', 'accessible'], ['careful', 'specific', 'useful'],
    ]) {
      add('rule-of-three/expanded', `The ${noun} is ${a}, ${b}, and ${c}.`);
      add('rule-of-three/expanded-pair', `The ${noun} is ${a} and ${b}.`);
    }
  }
  for (const imperative of ['Choose', 'Trust', 'Reward', 'Measure', 'Build', 'Protect']) {
    for (const [wanted, rejected] of [
      ['clarity', 'cleverness'], ['evidence', 'instinct'], ['people', 'metrics'],
      ['durability', 'novelty'], ['specifics', 'slogans'],
    ]) add('corrective-antithesis/expanded', `${imperative} ${wanted}, not ${rejected}.`);
  }
  for (const subject of ['The tool', 'The method', 'The interface', 'The report', 'The policy']) {
    for (const adjective of ['fast', 'accurate', 'clear', 'flexible', 'cheap', 'robust'])
      add('negative-parallelism/expanded', `${subject} is not only ${adjective} but also dependable.`);
  }

  // Inspiration families that probe gaps in today's rulepack. These are kept
  // even when they yield no sensitivity entries: absence is a coverage result.
  for (const [input, result] of [
    ['nothing', 'its usual style'], ['weak instructions', 'generic prose'],
    ['no examples', 'the default rhythm'], ['vague context', 'a vague answer'],
  ]) {
    add('personal/imperative-condition', `Give it ${input} and you get ${result}.`);
    add('personal/if-condition', `If you give it ${input}, you get ${result}.`);
  }
  for (const [left, right, outcome] of [
    ['smash your head through a brick wall', 'hire a wrecking ball', 'an opening'],
    ['rewrite every line by hand', 'hire an editor', 'a cleaner draft'],
    ['trace every call yourself', 'run the profiler', 'the bottleneck'],
    ['inspect every arc manually', 'train a diagnostic', 'the failure'],
  ]) {
    add('personal/modal-omitted', `You can ${left} or ${right}; both give you ${outcome}.`);
    add('personal/modal-explicit', `You can ${left} or ${right}; both will give you ${outcome}.`);
  }
  for (const object of ['these rules', 'these checks', 'these prompts', 'these tools']) {
    add('personal/coordination', `I use all of ${object} together. The model fails less, and I still have to supply the taste and catch what gets through.`);
    add('personal/subordination', `When I use all of ${object}, the model fails less. I still have to supply the taste and catch what gets through.`);
  }
  for (const [falseAgency, namedAgency] of [
    ['The data tells us which option works.', 'The analysts found which option works.'],
    ['The market rewards speed.', 'Buyers pay more for speed.'],
    ['The decision refuses to die.', 'The council refuses to reverse its decision.'],
    ['The culture embraces experimentation.', 'The managers reward experimentation.'],
    ['The research argues for a smaller model.', 'The researchers argue for a smaller model.'],
  ]) {
    add('stop-slop/false-agency', falseAgency);
    add('stop-slop/named-agency', namedAgency);
  }
  for (const [passive, active] of [
    ['The system was created in June.', 'The engineering team created the system in June.'],
    ['The decision was reached yesterday.', 'The board decided yesterday.'],
    ['Several mistakes were made.', 'The reviewers made several mistakes.'],
    ['The deadline was changed.', 'The client changed the deadline.'],
  ]) {
    add('stop-slop/passive', passive);
    add('stop-slop/active', active);
  }

  return [...new Map(out.map((seed) => [`${seed.family}\u0000${seed.text}`, seed])).values()];
}

const config = resolveConfig(recommended);
const structuralConfig = {
  ...config,
  rules: new Map([...config.rules].filter(([id]) => STRUCTURAL.has(id))),
};

class MutableParser implements Parser {
  sentence!: ParsedSentence;
  async parse(): Promise<ParsedSentence[]> { return [this.sentence]; }
}

function clone(sentence: ParsedSentence): ParsedSentence {
  return { ...sentence, tokens: sentence.tokens.map((token) => ({ ...token })) };
}

function symmetricDifference(left: Set<string>, right: Set<string>): string[] {
  return [...new Set([...left].filter((x) => !right.has(x)).concat([...right].filter((x) => !left.has(x))))].sort();
}

function wouldCreateCycle(sentence: ParsedSentence, tokenId: number, candidateHead: number): boolean {
  let current = candidateHead;
  const seen = new Set<number>();
  while (current !== 0 && !seen.has(current)) {
    if (current === tokenId) return true;
    seen.add(current);
    current = sentence.tokens.find((token) => token.id === current)?.head ?? 0;
  }
  return false;
}

async function main(): Promise<void> {
  const corpus = seeds();
  const parser = await loadParser();
  const mutable = new MutableParser();
  const replay = new Linter(mutable);
  const entries: Entry[] = [];
  let trials = 0;
  let seedIndex = 0;

  for (const seed of corpus) {
    const parsed = await parser.parse(seed.text);
    if (parsed.length !== 1) continue;
    const sentence = parsed[0]!;
    mutable.sentence = sentence;
    const baseline = new Set((await replay.lint(seed.text, structuralConfig)).lints.map((lint) => lint.ruleId));

    for (const token of sentence.tokens) {
      const interventions: Array<{ field: Entry['field']; from: string | number; to: string | number }> = [];
      for (const relation of RELATIONS) if (relation !== token.deprel)
        interventions.push({ field: 'deprel', from: token.deprel, to: relation });
      for (let head = 0; head <= sentence.tokens.length; head++)
        if (head !== token.id && head !== token.head && !wouldCreateCycle(sentence, token.id, head))
          interventions.push({ field: 'head', from: token.head, to: head });
      for (const upos of UPOS) if (upos !== token.upos)
        interventions.push({ field: 'upos', from: token.upos, to: upos });

      for (const intervention of interventions) {
        trials++;
        const changed = clone(sentence);
        const changedToken = changed.tokens.find((candidate) => candidate.id === token.id)!;
        if (intervention.field === 'head') changedToken.head = Number(intervention.to);
        else if (intervention.field === 'deprel') changedToken.deprel = String(intervention.to);
        else changedToken.upos = String(intervention.to);
        mutable.sentence = changed;
        const mutated = new Set((await replay.lint(seed.text, structuralConfig)).lints.map((lint) => lint.ruleId));
        const changedRules = symmetricDifference(baseline, mutated);
        if (!changedRules.length) continue;
        entries.push({
          id: `pilot-${String(entries.length + 1).padStart(6, '0')}`,
          family: seed.family,
          text: seed.text,
          baselineRules: [...baseline].sort(),
          tokenId: token.id,
          token: token.form,
          ...intervention,
          changedRules,
        });
      }
    }
    seedIndex++;
    if (seedIndex % 20 === 0) process.stderr.write(`processed ${seedIndex} seeds\n`);
  }

  const byRule: Record<string, number> = {};
  const byField: Record<string, number> = {};
  const byFamily: Record<string, number> = {};
  const seedsByFamily: Record<string, number> = {};
  for (const seed of corpus) seedsByFamily[seed.family] = (seedsByFamily[seed.family] ?? 0) + 1;
  for (const entry of entries) {
    byField[entry.field] = (byField[entry.field] ?? 0) + 1;
    byFamily[entry.family] = (byFamily[entry.family] ?? 0) + 1;
    for (const rule of entry.changedRules) byRule[rule] = (byRule[rule] ?? 0) + 1;
  }
  const output = resolve('experiments/rule-sensitivity/out');
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'seeds.jsonl'), corpus.map((seed) => JSON.stringify(seed)).join('\n') + '\n');
  await writeFile(resolve(output, 'pilot.jsonl'), entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  await writeFile(resolve(output, 'summary.json'), JSON.stringify({
    seeds: corpus.length,
    trials,
    sensitiveEntries: entries.length,
    sensitivityRate: entries.length / trials,
    byRule,
    byField,
    byFamily,
    seedsByFamily,
    zeroSensitivityFamilies: Object.keys(seedsByFamily).filter((family) => !byFamily[family]),
  }, null, 2) + '\n');
  console.log(JSON.stringify({ seeds: corpus.length, trials, sensitiveEntries: entries.length, byRule, byField }, null, 2));
}

await main();
