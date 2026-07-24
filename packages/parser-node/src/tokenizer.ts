export interface WordToken {
  form: string;
  start: number;
  end: number;
}

export interface SentenceTokens {
  text: string;
  start: number;
  end: number;
  words: WordToken[];
}

export interface EncodedWords {
  inputIds: number[];
  wordStarts: number[];
}

const terminal = /[.!?]/u;
const closer = /["'”’»)\]}]/u;

/** Conservative English sentence segmentation with document-global UTF-16 spans. */
export function splitSentences(text: string): Array<{ text: string; start: number; end: number }> {
  const sentences: Array<{ text: string; start: number; end: number }> = [];
  let start = 0;
  const push = (rawEnd: number) => {
    let left = start;
    let right = rawEnd;
    while (left < right && /\s/u.test(text[left]!)) left++;
    while (right > left && /\s/u.test(text[right - 1]!)) right--;
    if (left < right) sentences.push({ text: text.slice(left, right), start: left, end: right });
    start = rawEnd;
  };
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (character === '\u2029') {
      push(index + 1);
      continue;
    }
    if (character === '\n') {
      if (text[index + 1] === '\n') push(index + 1);
      continue;
    }
    if (!terminal.test(character)) continue;
    let end = index + 1;
    while (end < text.length && terminal.test(text[end]!)) end++;
    while (end < text.length && closer.test(text[end]!)) end++;
    if (end === text.length || /\s/u.test(text[end]!)) {
      push(end);
      index = end - 1;
    }
  }
  push(text.length);
  return sentences;
}

const rawWord = /(?:https?:\/\/|www\.)[^\s]+|[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*|\p{N}+(?:[.,:]\p{N}+)*|[^\s]/gu;
const contractions = /^(.*?)(n't|'s|'re|'ve|'ll|'d|'m)$/iu;

/** Tokenize a sentence into UD-like syntactic words while preserving spans. */
export function tokenizeWords(sentence: { text: string; start: number; end: number }): SentenceTokens {
  const words: WordToken[] = [];
  for (const match of sentence.text.matchAll(rawWord)) {
    const form = match[0];
    const localStart = match.index!;
    if (form.toLowerCase() === 'cannot') {
      words.push({ form: form.slice(0, 3), start: sentence.start + localStart, end: sentence.start + localStart + 3 });
      words.push({ form: form.slice(3), start: sentence.start + localStart + 3, end: sentence.start + localStart + form.length });
      continue;
    }
    const contraction = form.replaceAll('’', "'").match(contractions);
    if (contraction?.[1]) {
      const stemLength = contraction[1].length;
      words.push({ form: form.slice(0, stemLength), start: sentence.start + localStart, end: sentence.start + localStart + stemLength });
      words.push({ form: form.slice(stemLength), start: sentence.start + localStart + stemLength, end: sentence.start + localStart + form.length });
    } else {
      words.push({ form, start: sentence.start + localStart, end: sentence.start + localStart + form.length });
    }
  }
  return { ...sentence, words };
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function vocabId(vocab: Readonly<Record<string, number>>, piece: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(vocab, piece) ? vocab[piece] : undefined;
}

/** Exact greedy BERT WordPiece encoding for an already segmented word sequence. */
export function encodeWordPieces(words: readonly WordToken[], vocab: Readonly<Record<string, number>>): EncodedWords {
  const inputIds = [vocabId(vocab, '[CLS]') ?? 101];
  const wordStarts: number[] = [];
  for (const word of words) {
    wordStarts.push(inputIds.length);
    const normalized = normalize(word.form);
    if ([...normalized].length > 100) {
      inputIds.push(vocabId(vocab, '[UNK]') ?? 100);
      continue;
    }
    const pieces: number[] = [];
    let start = 0;
    while (start < normalized.length) {
      let end = normalized.length;
      let id: number | undefined;
      while (end > start) {
        const piece = `${start === 0 ? '' : '##'}${normalized.slice(start, end)}`;
        id = vocabId(vocab, piece);
        if (id !== undefined) break;
        end--;
      }
      if (id === undefined) {
        pieces.length = 0;
        pieces.push(vocabId(vocab, '[UNK]') ?? 100);
        break;
      }
      pieces.push(id);
      start = end;
    }
    inputIds.push(...pieces);
  }
  inputIds.push(vocabId(vocab, '[SEP]') ?? 102);
  return { inputIds, wordStarts };
}

/**
 * Split a tokenizer sentence into model-sized spans without dropping text.
 * Dependency edges cannot cross a chunk boundary, but every source token keeps
 * its original document-global offset and remains available to lint rules.
 */
export function chunkForEncoder(
  sentence: SentenceTokens,
  vocab: Readonly<Record<string, number>>,
  maximumSubwords = 256,
): SentenceTokens[] {
  if (maximumSubwords < 3) throw new Error('maximumSubwords must leave room for [CLS], a token, and [SEP]');
  if (encodeWordPieces(sentence.words, vocab).inputIds.length <= maximumSubwords) return [sentence];

  const maximumContentPieces = maximumSubwords - 2;
  const chunks: WordToken[][] = [];
  let words: WordToken[] = [];
  let pieces = 0;

  const push = () => {
    if (words.length) chunks.push(words);
    words = [];
    pieces = 0;
  };

  for (const word of sentence.words) {
    const wordPieces = encodeWordPieces([word], vocab).inputIds.length - 2;
    if (words.length && pieces + wordPieces > maximumContentPieces) push();
    words.push(word);
    pieces += wordPieces;
  }
  push();

  return chunks.map((chunkWords) => {
    const start = chunkWords[0]!.start;
    const end = chunkWords.at(-1)!.end;
    return {
      text: sentence.text.slice(start - sentence.start, end - sentence.start),
      start,
      end,
      words: chunkWords,
    };
  });
}
