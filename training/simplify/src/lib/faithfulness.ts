// Faithfulness and echo metrics shared by the eval harness and the GRPO
// reward. A rewrite may change any word it likes, but the anchors — numbers,
// code spans, identifiers, links — have to survive untouched, and the rewrite
// must not invent new ones. Breaking the copy habit without this check trades
// a visible failure (verbatim output) for an invisible one (confabulation).

const SMALL_NUMBERS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
];

/** Digits and small number words share a key so "6 fixes" -> "six fixes" is
 * not scored as a dropped anchor. */
function numberKey(token: string): string {
  const word = SMALL_NUMBERS.indexOf(token.toLowerCase());
  if (word >= 0) return `n:${word}`;
  // "50%" and "50 percent" are the same fact worded two ways, and so are "1.0"
  // and "1". Keying them apart made a rewrite look like it dropped one number
  // and invented another, which is the rewording the model should be free to do.
  const bare = token
    .replace(/%$/, '')
    .replace(/^0+(?=\d)/, '')
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return `n:${bare}`;
}

export interface Anchors {
  /** Numbers, normalized so digits and small number words unify. */
  numbers: Set<string>;
  /** Backticked spans, bare identifiers, URLs — matched case-sensitively. */
  symbols: Set<string>;
}

const CODE_SPAN = /`([^`\n]+)`/g;
const URL = /\bhttps?:\/\/[^\s)<>]+/g;
const NUMBER = /\b\d[\d,]*(?:\.\d+)?%?\b/g;
// Bare identifiers, each pattern chosen so a rewriter still has room to reword.
// The hyphen is deliberately absent from the separator class: "forward-only"
// and "fail-closed" are ordinary English that a rewrite may rephrase, while
// TICKET-123 and #422 are names it may not.
const IDENTIFIERS = [
  /\b[A-Za-z][A-Za-z0-9]*(?:[_./][A-Za-z0-9]+)+\b/g, // snake_case, dotted.paths, a/path
  /\b[a-z]+[A-Z][A-Za-z0-9]*\b/g, // camelCase
  /\b[A-Z]{2,}-\d+\b/g, // NFX-1838
  /#\d+\b/g, // #422
  /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g, // commit shas
];

/** @param numberWords whether "six" alone may create a number anchor. The two
 * sides of a comparison want different answers, which is why this is a
 * parameter. See `faithfulness` below. */
export function extractAnchors(text: string, numberWords = false): Anchors {
  const numbers = new Set<string>();
  const symbols = new Set<string>();

  for (const match of text.matchAll(CODE_SPAN)) symbols.add(match[1].trim());
  for (const match of text.matchAll(URL)) symbols.add(match[0].replace(/[.,;:]$/, ''));

  // Identifiers and numbers are read from the text with code spans blanked
  // out, so a span already captured whole is not also split into pieces.
  const bare = text.replace(CODE_SPAN, ' ').replace(URL, ' ');
  for (const pattern of IDENTIFIERS) {
    for (const match of bare.matchAll(pattern)) symbols.add(match[0]);
  }
  for (const match of bare.matchAll(NUMBER)) numbers.add(numberKey(match[0].replace(/,/g, '')));
  // Number words are read on the output side only.
  //
  // Reading them on both sides made every essay anchor-dense on words that
  // carry no fact: over the 155 drift documents, 19% of all anchors and 40% of
  // every dropped-anchor PENALTY came from "one" through "twelve". A rewrite
  // turning "one of the reasons" into "a reason" is correct, and it was being
  // charged for it, which pushed the model toward copying in exactly the essay
  // domain where preservation is already rewarded.
  //
  // Dropping them everywhere is wrong too, and briefly broke the opposite
  // case: with no sweep at all, a source saying "6 fixes" and a rewrite saying
  // "Six fixes" scored as a dropped fact. Reading them only on the output side
  // gives both answers. A word can satisfy a digit the source really carried,
  // and a word alone can never invent an anchor for the source to lose.
  if (numberWords) {
    for (const word of SMALL_NUMBERS) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(bare)) numbers.add(numberKey(word));
    }
  }
  return { numbers, symbols };
}

export interface FaithfulnessResult {
  /** Share of the input's anchors that survive into the output. */
  keptRate: number;
  /** Anchors the output introduces that the input never contained. */
  inventedCount: number;
  droppedCount: number;
  anchorCount: number;
  droppedSample: string[];
  inventedSample: string[];
}

/**
 * Compare the anchors of a rewrite against its source. Symbols are matched
 * on substring so a rewrite may reformat `foo_bar` as plain foo_bar, but a
 * dropped or altered identifier still counts against it.
 */
export function faithfulness(input: string, output: string): FaithfulnessResult {
  // Three readings, because the two halves of this comparison need different
  // ones. `from` is strict, so a bare "one" in the source is never an anchor
  // the rewrite can be charged with losing. `fromLoose` is what invention is
  // judged against, so a "two" the source really said is not then counted as a
  // number the rewrite made up. `to` is loose, so a spelled-out word can
  // satisfy a digit. Reading the source strictly on both sides scored a
  // verbatim copy at 0.65 faithfulness, which is how this was caught.
  const from = extractAnchors(input);
  const fromLoose = extractAnchors(input, true);
  const to = extractAnchors(output, true);
  const outputLower = output.toLowerCase();

  const dropped: string[] = [];
  for (const symbol of from.symbols) {
    if (!to.symbols.has(symbol) && !outputLower.includes(symbol.toLowerCase())) dropped.push(symbol);
  }
  for (const number of from.numbers) {
    if (!to.numbers.has(number)) dropped.push(number);
  }

  const invented: string[] = [];
  for (const symbol of to.symbols) {
    if (!from.symbols.has(symbol) && !input.toLowerCase().includes(symbol.toLowerCase())) invented.push(symbol);
  }
  for (const number of to.numbers) {
    if (!fromLoose.numbers.has(number)) invented.push(number);
  }

  const anchorCount = from.symbols.size + from.numbers.size;
  return {
    keptRate: anchorCount === 0 ? 1 : (anchorCount - dropped.length) / anchorCount,
    inventedCount: invented.length,
    droppedCount: dropped.length,
    anchorCount,
    droppedSample: dropped.slice(0, 10),
    inventedSample: invented.slice(0, 10),
  };
}

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function ngrams(tokens: string[], n: number): Set<string> {
  if (tokens.length < n) return new Set();
  const out = new Set<string>();
  for (let i = 0; i <= tokens.length - n; i += 1) out.add(tokens.slice(i, i + n).join(' '));
  return out;
}

/**
 * Share of the output's n-grams lifted verbatim from the input. Around 0.3 is
 * the floor on identifier-dense text, because a faithful rewrite keeps names
 * and numbers in place; near 1.0 means the model returned its input.
 */
export function echoRate(input: string, output: string, n = 4): number {
  const outGrams = ngrams(words(output), n);
  if (outGrams.size === 0) return 0;
  const inGrams = ngrams(words(input), n);
  let hits = 0;
  for (const gram of outGrams) if (inGrams.has(gram)) hits += 1;
  return hits / outGrams.size;
}

/**
 * Share of the output's distinct words that also appear in the input, ignoring
 * order. Read next to `echoRate`, this separates a rewrite from a shuffle: a
 * real rewrite reuses maybe half the vocabulary and a fifth of the 4-grams,
 * while text whose words were merely reordered reuses nearly every word and
 * almost no 4-gram. The reward has to catch that, because a shuffle keeps every
 * fact anchored, echoes nothing, and lands squarely in the length band.
 */
export function vocabularyOverlap(input: string, output: string): number {
  const outWords = new Set(words(output));
  if (outWords.size === 0) return 0;
  const inWords = new Set(words(input));
  let hits = 0;
  for (const word of outWords) if (inWords.has(word)) hits += 1;
  return hits / outWords.size;
}
