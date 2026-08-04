import { childrenOf, defineRule, lower, root, type Document, type Paragraph, type Sentence } from 'writinglint-core';

type BeatKind = 'aphorism' | 'compressed-result' | 'headline-declarative' | 'metaphor' | 'question' | 'reveal' | 'heading';

interface Beat {
  start: number;
  end: number;
  paragraph: number;
  kind: BeatKind;
}

const LIST_OR_QUOTE_RE = /^\s*(?:[-*+]\s+|\d+[.)]\s+|>)/m;
const HEADING_RE = /^#{1,6}[\t ]+([^\n#]+?)[\t ]*#*[\t ]*$/gm;
const THEATRICAL_HEADING_RE = /^(?:watch|meet|notice|see|look at|find|follow|remember)\b|\b(?:before any|the next .+ (?:appear|arrive|break)|we (?:were|have been) missing|what happens next|at last)\b/i;
const TOTALIZERS = new Set(['answer', 'catch', 'key', 'lesson', 'point', 'secret', 'story', 'thing', 'trick', 'whole']);
const IMAGE_NOUNS = new Set([
  'animal', 'bend', 'box', 'bridge', 'corner', 'door', 'edge', 'engine', 'firework',
  'map', 'race', 'road', 'shape', 'stranger', 'summit', 'terrain', 'valley', 'wall',
]);
const RETROSPECTIVE = new Set(['again', 'different', 'finally', 'last', 'missing', 'next', 'only', 'whole']);
const THESIS_SUBJECTS = new Set(['goal', 'growth', 'idea', 'key', 'lesson', 'outcome', 'path', 'point', 'power', 'result', 'story']);
const THESIS_PREDICATES = new Set(['allow', 'allows', 'become', 'becomes', 'continue', 'continues', 'mean', 'means', 'require', 'requires', 'show', 'shows']);

const words = (sentence: Sentence): string[] => sentence.words.map((token) => token.lower);

function isMarkdownHeading(doc: Document, sentence: Sentence): boolean {
  const lineStart = doc.text.lastIndexOf('\n', Math.max(0, sentence.start - 1)) + 1;
  return /^#{1,6}\s/.test(doc.text.slice(lineStart, sentence.end));
}

function isParagraphEnding(paragraph: Paragraph, sentence: Sentence): boolean {
  const final = paragraph.sentences.at(-1);
  return final?.index === sentence.index;
}

function isHeadlineDeclarative(sentence: Sentence): boolean {
  const text = sentence.text.trim();
  const lowerWords = words(sentence);
  const predicate = root(sentence.dep);
  if (!predicate) return false;
  const children = childrenOf(sentence.dep, predicate.id);
  const subject = children.find((token) => token.deprel === 'nsubj' || token.deprel.startsWith('nsubj:'));
  const subjectWord = subject ? lower(subject).replace(/s$/, '') : '';
  const deicticSummary = ['this', 'that', 'it'].includes(lowerWords[0] ?? '')
    && (children.some((token) => token.deprel === 'cop') || THESIS_PREDICATES.has(lower(predicate)));
  const abstractThesis = THESIS_SUBJECTS.has(subjectWord)
    && (children.some((token) => token.deprel === 'cop')
      || THESIS_PREDICATES.has(lower(predicate))
      || lowerWords.some((word) => ['cannot', 'extraordinary', 'not', 'should'].includes(word)));
  const announcedSummary = /^(?:over time|so\b)/i.test(text) && (abstractThesis || /\b(?:result|outcome|path|scale)\b/i.test(text));
  const superlativeLesson = /\bone of the (?:best|most|simplest|easiest)\b/i.test(text);
  return deicticSummary || abstractThesis || announcedSummary || superlativeLesson;
}

function classifyPerformedRevelationBeat(sentence: Sentence): BeatKind | undefined {
  const tokens = sentence.dep.tokens.filter((token) => token.upos !== 'PUNCT' && token.upos !== 'SYM');
  if (tokens.length < 2 || tokens.length > 22) return undefined;
  const text = sentence.text.trim();
  const lowerWords = words(sentence);
  const predicate = root(sentence.dep);
  if (!predicate) return undefined;
  const children = childrenOf(sentence.dep, predicate.id);
  const subject = children.find((token) => token.deprel === 'nsubj' || token.deprel.startsWith('nsubj:'));
  const subjectWords = subject ? [lower(subject), ...childrenOf(sentence.dep, subject.id).map(lower)] : [];
  const hasImage = lowerWords.some((word) => IMAGE_NOUNS.has(word));
  const hasRetrospective = lowerWords.some((word) => RETROSPECTIVE.has(word)) || /\bturns? out\b/i.test(text);

  // A question is only evidence here when it is staged as a reaction and uses
  // an analogy. Ordinary pedagogical questions are common in human teaching.
  if (text.endsWith('?') && /^(?:so|but|and)\s+(?:why|what|how)\b/i.test(text) && hasImage) return 'question';

  const totalizingComplement = lowerWords.some((word) => TOTALIZERS.has(word));
  if (totalizingComplement && hasRetrospective
    && (subjectWords.some((word) => ['that', 'this', 'one'].includes(word)) || /\bturns? out\b/i.test(text))) {
    return 'reveal';
  }

  const copular = children.some((token) => token.deprel === 'cop');
  if (copular && hasImage && hasRetrospective
    && subjectWords.some((word) => ['that', 'this', 'failure', 'corner'].includes(word))) {
    return 'metaphor';
  }

  const genericIndefiniteSubject = subject != null
    && childrenOf(sentence.dep, subject.id).some((token) => token.deprel === 'det' && /^(?:a|an)$/.test(lower(token)));
  if (genericIndefiniteSubject && hasImage && /^(?:deserve|demand|need|reward)/.test(lower(predicate))) return 'aphorism';

  const secondPerson = lowerWords[0] === 'you';
  const negativeModals = lowerWords.filter((word) => word === 'not' || word === 'cannot' || word === "can't").length;
  if (secondPerson && (negativeModals >= 2 || /\byour way (?:to|through)\b/i.test(text)) && hasImage) return 'aphorism';

  if (/^(?:reach|find|hit|meet)/.test(lower(predicate)) && hasImage && hasRetrospective) return 'reveal';

  // Deliberately isolated numerical result: a useful teaching device once,
  // but a repeated sequence of these becomes reveal-driven copy.
  if (tokens.length <= 5 && /\b(?:percent|months?|years?|seconds?|times?|x)\b/i.test(text)
    && !tokens.some((token) => token.upos === 'VERB' || token.upos === 'AUX')) {
    return 'compressed-result';
  }

  // A bold standalone proposition is visually promoted into a quotation even
  // though it sits in the body rather than serving as navigation.
  if (/^\*\*[^\n]+\*\*[.!?]?$/.test(text)) return 'aphorism';

  // Short terminal denials and closures are weak alone; the document-level
  // repetition gate below is what makes them actionable.
  if (tokens.length <= 18 && /^(?:neither|none|not\b|it just\b|that(?:'|’)s (?:it|all)\b)/i.test(text)) return 'aphorism';
  return undefined;
}

function headingBeats(text: string, paragraphs: Paragraph[]): Beat[] {
  const beats: Beat[] = [];
  for (const match of text.matchAll(HEADING_RE)) {
    const label = match[1]?.trim() ?? '';
    if (!THEATRICAL_HEADING_RE.test(label)) continue;
    const start = match.index;
    const paragraph = paragraphs.find((candidate) => start >= candidate.start && start < candidate.end)?.index ?? 0;
    beats.push({ start, end: start + match[0].length, paragraph, kind: 'heading' });
  }
  return beats;
}

function localCluster(beats: Beat[], minimum: number, paragraphSpan: number): Beat[] {
  let best: Beat[] = [];
  for (let left = 0; left < beats.length; left++) {
    const cluster = beats.filter((beat) =>
      beat.paragraph >= beats[left]!.paragraph && beat.paragraph - beats[left]!.paragraph <= paragraphSpan);
    if (cluster.length > best.length) best = cluster;
  }
  return best.length >= minimum ? best : [];
}

function candidatePerformedRevelationBeats(doc: Document): Beat[] {
  const prose: Beat[] = [];
  for (const paragraph of doc.paragraphs) {
    if (LIST_OR_QUOTE_RE.test(paragraph.text)) continue;
    const onlySentence = paragraph.sentences.length === 1 ? paragraph.sentences[0] : undefined;
    if (onlySentence && !isMarkdownHeading(doc, onlySentence)) {
      const count = onlySentence.words.length;
      const text = onlySentence.text.trim();
      if (count >= 5 && count <= 18 && !/[?]$/.test(text) && !/^\s*\(/.test(text)
        && isHeadlineDeclarative(onlySentence)) {
        prose.push({
          start: onlySentence.start,
          end: onlySentence.end,
          paragraph: paragraph.index,
          kind: 'headline-declarative',
        });
        continue;
      }
    }
    for (const sentence of paragraph.sentences) {
      if (isMarkdownHeading(doc, sentence)) continue;
      const kind = classifyPerformedRevelationBeat(sentence);
      if (!kind) continue;
      const interiorResult = kind === 'compressed-result';
      if (!interiorResult && !isParagraphEnding(paragraph, sentence)) continue;
      prose.push({ start: sentence.start, end: sentence.end, paragraph: paragraph.index, kind });
    }
  }

  return [...prose, ...headingBeats(doc.text, doc.paragraphs)].sort((a, b) => a.start - b.start);
}

function detectPerformedRevelation(doc: Document): Beat[] {
  const candidates = candidatePerformedRevelationBeats(doc);
  const prose = candidates.filter((beat) => beat.kind !== 'heading');
  const headings = candidates.filter((beat) => beat.kind === 'heading');
  const headlineDeclarations = candidates.filter((beat) => beat.kind === 'headline-declarative');
  const proseCluster = localCluster(prose, 4, 8);
  const headingCluster = localCluster(headings, 3, 12);
  const headlineCluster = localCluster(headlineDeclarations, 6, 14);
  const combined = localCluster([...prose, ...headings].sort((a, b) => a.start - b.start), 4, 10);
  const selected = new Map<number, Beat>();
  for (const beat of [...proseCluster, ...headingCluster, ...headlineCluster, ...combined]) selected.set(beat.start, beat);
  return [...selected.values()];
}

/** Repeated paragraph-end reveals and headline beats that make exposition sound performed. */
export const performedRevelation = defineRule({
  meta: {
    name: 'performed-revelation',
    category: 'performance',
    docs: {
      description: 'Repeated questions, metaphors, and compressed payoffs make an explanation sound like prepared revelations.',
    },
  },
  create(ctx) {
    return {
      Document(doc) {
        const selected = detectPerformedRevelation(doc);
        if (selected.length < 3) return;

        const kinds = new Set(selected.map((beat) => beat.kind));
        for (const beat of selected) {
          ctx.report({
            span: { start: beat.start, end: beat.end },
            confidence: 'medium',
            message: `Prepared-revelation cadence: ${selected.length} nearby beats use ${kinds.size} punchline shapes. Let some transitions explain, remind, or connect instead of making every section land like a headline.`,
          });
        }
      },
    };
  },
});
