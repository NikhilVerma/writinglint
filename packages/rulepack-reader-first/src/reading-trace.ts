import {
  byId,
  childrenByRel,
  type DepSentence,
  type DepToken,
  type Document,
  type DocumentRegion,
  type Paragraph,
  type Sentence,
  type Tok,
} from 'writinglint-core';

const EXCLUDED_READING_ROLES = new Set(['code', 'disclosure', 'heading', 'metadata', 'quotation', 'table', 'table-cell']);
const CLAUSE_RELATIONS = new Set(['root', 'conj', 'advcl', 'ccomp', 'xcomp', 'parataxis', 'acl']);

export type ReadingUnitKind = 'paragraph' | 'list-item';
export type ParticipantRole = 'subject' | 'object' | 'indirect-object' | 'oblique';

export interface EntityMention {
  key: string;
  text: string;
  start: number;
  end: number;
  sentence: number;
  upos: string;
}

export interface PropositionParticipant extends EntityMention {
  role: ParticipantRole;
  inherited?: boolean;
}

export interface Proposition {
  sentence: number;
  start: number;
  end: number;
  predicate: {
    key: string;
    text: string;
    start: number;
    end: number;
  };
  subjects: PropositionParticipant[];
  objects: PropositionParticipant[];
  /** True when the parser exposes no subject and we cannot inherit one from a coordinated parent clause. */
  unresolvedSubject: boolean;
}

export interface ReadingUnitTrace {
  index: number;
  kind: ReadingUnitKind;
  start: number;
  end: number;
  text: string;
  sentences: Sentence[];
  tokens: Tok[];
  entities: EntityMention[];
  propositions: Proposition[];
}

export interface TraceRelationship {
  key: string;
  predicate: string;
  subject: string;
  object?: string;
}

export interface RoleChange {
  entity: string;
  from: ParticipantRole;
  to: ParticipantRole;
}

export interface Reactivation {
  key: string;
  inactiveSentences: number;
}

export type BufferItemKind = 'entity' | 'relationship';
export type BufferEventKind = 'push' | 'reinforce' | 'pop' | 'reactivate';
export type BufferEventReason = 'introduction' | 'mention' | 'decay' | 'heading' | 'consolidation';

export interface BufferEvent {
  kind: BufferEventKind;
  itemKind: BufferItemKind;
  key: string;
  reason: BufferEventReason;
}

export interface OpenIdea {
  id: string;
  label: string;
  topics: string[];
  start: number;
  sentence: number;
}

export interface IdeaEvent {
  kind: 'push' | 'pop';
  idea: OpenIdea;
  reason: 'forward-promise' | 'topic-return';
}

export interface OpenDecisionStandard {
  term: string;
  text: string;
  start: number;
  end: number;
  sentence: number;
}

export interface DecisionStandardEvent {
  kind: 'push' | 'pop';
  standard: OpenDecisionStandard;
  reason: 'judgment-use' | 'definition';
}

export interface LoadSnapshot {
  pushes: number;
  reinforcements: number;
  pops: number;
  reactivations: number;
  activeEntityFrames: number;
  activeRelationshipFrames: number;
  openIdeaFrames: number;
  openDecisionFrames: number;
  roleChanges: number;
  netInflow: number;
}

export interface ReadingMoment {
  sentence: number;
  unit: number;
  start: number;
  end: number;
  introducedEntities: string[];
  reinforcedEntities: string[];
  reactivatedEntities: string[];
  entityReactivations: Reactivation[];
  newRelationships: TraceRelationship[];
  reinforcedRelationships: TraceRelationship[];
  relationshipReactivations: Reactivation[];
  roleChanges: RoleChange[];
  releasedEntities: string[];
  releasedRelationships: string[];
  bufferEvents: BufferEvent[];
  ideaEvents: IdeaEvent[];
  activeIdeas: OpenIdea[];
  decisionStandardEvents: DecisionStandardEvent[];
  activeDecisionStandards: OpenDecisionStandard[];
  load: LoadSnapshot;
  /** Entity frames still active after this sentence. */
  activeEntities: string[];
  /** Relationship frames still active after this sentence. */
  activeRelationships: string[];
  structuralBoundaryBefore: boolean;
  headingBoundaryBefore: boolean;
  consolidationCues: string[];
}

export interface ReadingTrace {
  units: ReadingUnitTrace[];
  propositions: Proposition[];
  moments: ReadingMoment[];
}

const readingTraceCache = new WeakMap<Document, ReadingTrace>();

const IRREGULAR_NOUNS = new Map([
  ['analyses', 'analysis'],
  ['criteria', 'criterion'],
  ['indices', 'index'],
  ['people', 'person'],
]);
const UNCHANGED_S_NOUNS = new Set(['series', 'species']);

/** Collapse obvious English number variants without stemming unrelated words. */
export function canonicalEntityKey(token: { lemma?: string; form?: string; lower?: string; upos?: string }): string {
  const value = (token.lemma ?? token.lower ?? token.form ?? '').toLowerCase();
  if (token.upos !== 'NOUN') return value;
  const irregular = IRREGULAR_NOUNS.get(value);
  if (irregular) return irregular;
  if (UNCHANGED_S_NOUNS.has(value)) return value;
  if (/[^aeiou]ies$/u.test(value)) return `${value.slice(0, -3)}y`;
  if (/(?:[sxz]|ch|sh)es$/u.test(value)) return value.slice(0, -2);
  if (value.length > 3 && /s$/u.test(value) && !/(?:ss|us|is)$/u.test(value)) return value.slice(0, -1);
  return value;
}

function entityKey(token: { lemma?: string; form?: string; lower?: string; upos?: string }): string {
  return canonicalEntityKey(token);
}

function mentionFromToken(token: Tok): EntityMention {
  return {
    key: entityKey(token),
    text: token.text,
    start: token.start,
    end: token.end,
    sentence: token.sentence,
    upos: token.upos,
  };
}

function participantFromToken(token: DepToken, sentence: number, role: ParticipantRole, inherited = false): PropositionParticipant {
  return {
    key: entityKey(token),
    text: token.form,
    start: token.start,
    end: token.end,
    sentence,
    upos: token.upos,
    role,
    ...(inherited ? { inherited: true } : {}),
  };
}

function relation(token: DepToken): string {
  return token.deprel.split(':', 1)[0]!;
}

function coordinated(sentence: DepSentence, token: DepToken): DepToken[] {
  const output: DepToken[] = [];
  const pending = [token];
  const visited = new Set<number>();
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    output.push(current);
    pending.push(...childrenByRel(sentence, current.id, 'conj'));
  }
  return output;
}

function directSubjects(sentence: DepSentence, predicate: DepToken): DepToken[] {
  const heads = [
    ...childrenByRel(sentence, predicate.id, 'nsubj'),
    ...childrenByRel(sentence, predicate.id, 'csubj'),
  ];
  return heads.flatMap((head) => coordinated(sentence, head));
}

function inheritedSubjects(sentence: DepSentence, predicate: DepToken): DepToken[] {
  const visited = new Set<number>();
  let current: DepToken | undefined = predicate;
  while (current && current.head !== 0 && !visited.has(current.id)) {
    visited.add(current.id);
    current = byId(sentence, current.head);
    if (!current) return [];
    const subjects = directSubjects(sentence, current);
    if (subjects.length > 0) return subjects;
    if (relation(current) !== 'conj') return [];
  }
  return [];
}

function propositionFor(sentence: Sentence, predicate: DepToken): Proposition {
  const direct = directSubjects(sentence.dep, predicate);
  const inherited = direct.length > 0 ? [] : inheritedSubjects(sentence.dep, predicate);
  const subjects = direct.length > 0 ? direct : inherited;
  const objects: PropositionParticipant[] = [
    ...childrenByRel(sentence.dep, predicate.id, 'obj').flatMap((token) => coordinated(sentence.dep, token)).map((token) => participantFromToken(token, sentence.index, 'object')),
    ...childrenByRel(sentence.dep, predicate.id, 'iobj').flatMap((token) => coordinated(sentence.dep, token)).map((token) => participantFromToken(token, sentence.index, 'indirect-object')),
    ...childrenByRel(sentence.dep, predicate.id, 'obl').flatMap((token) => coordinated(sentence.dep, token)).map((token) => participantFromToken(token, sentence.index, 'oblique')),
  ];
  const subjectParticipants = subjects.map((subject) =>
    participantFromToken(subject, sentence.index, 'subject', inherited.length > 0));
  const participants = [...subjectParticipants, ...objects];
  const start = Math.min(predicate.start, ...participants.map((participant) => participant.start));
  const end = Math.max(predicate.end, ...participants.map((participant) => participant.end));
  return {
    sentence: sentence.index,
    start,
    end,
    predicate: {
      key: entityKey(predicate),
      text: predicate.form,
      start: predicate.start,
      end: predicate.end,
    },
    subjects: subjectParticipants,
    objects,
    unresolvedSubject: subjects.length === 0,
  };
}

function propositionsFor(sentence: Sentence): Proposition[] {
  return sentence.dep.tokens
    .filter((token) => (token.upos === 'VERB' || token.upos === 'AUX') && CLAUSE_RELATIONS.has(relation(token)))
    .map((predicate) => propositionFor(sentence, predicate));
}

function readableRanges(document: Document, start: number, end: number): Array<{ start: number; end: number }> {
  const exclusions = document.regions
    .filter((region) => (EXCLUDED_READING_ROLES.has(region.role) || region.mode === 'supplementary')
      && region.end > start && region.start < end)
    .map((region) => ({ start: Math.max(start, region.start), end: Math.min(end, region.end) }))
    .sort((left, right) => left.start - right.start || right.end - left.end);
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = start;
  for (const exclusion of exclusions) {
    if (exclusion.start > cursor) ranges.push({ start: cursor, end: exclusion.start });
    cursor = Math.max(cursor, exclusion.end);
  }
  if (cursor < end) ranges.push({ start: cursor, end });
  return ranges.flatMap((range) => {
    const text = document.text.slice(range.start, range.end);
    const leading = text.search(/\S/u);
    if (leading < 0) return [];
    const trailing = text.length - text.trimEnd().length;
    return [{ start: range.start + leading, end: range.end - trailing }];
  });
}

function listItemsInside(document: Document, paragraph: Paragraph): DocumentRegion[] {
  return document.regions
    .filter((region) => region.role === 'list-item'
      && region.start >= paragraph.start && region.end <= paragraph.end)
    .sort((left, right) => left.start - right.start);
}

function unitRanges(document: Document): Array<{ kind: ReadingUnitKind; start: number; end: number }> {
  const units: Array<{ kind: ReadingUnitKind; start: number; end: number }> = [];
  for (const paragraph of document.paragraphs) {
    const listItems = listItemsInside(document, paragraph);
    if (listItems.length > 0) {
      for (const item of listItems) {
        for (const range of readableRanges(document, item.start, item.end)) {
          units.push({ kind: 'list-item', ...range });
        }
      }
    } else {
      for (const range of readableRanges(document, paragraph.start, paragraph.end)) {
        units.push({ kind: 'paragraph', ...range });
      }
    }
  }
  return units;
}

function consolidationCues(text: string): string[] {
  const cues: string[] = [];
  if (/\b(?:in short|in summary|to summarise|to summarize|overall)\b/iu.test(text)) cues.push('summary');
  if (/\b(?:the result is|the outcome is|this means|taken together)\b/iu.test(text)) cues.push('synthesis');
  if (/\b(?:at this point|by then|from here|returning to|back to|as (?:noted|described) earlier)\b/iu.test(text)
    || /^\s*(?:earlier|previously)\b/iu.test(text)) cues.push('orientation');
  return cues;
}

const FORWARD_PROMISE_RE = /\b(?:(?:we|this (?:section|document|article|guide)) (?:will|shall) (?:explain|describe|define|show|cover|discuss|revisit|address|consider)|(?:explained|described|defined|shown|covered|discussed|addressed) (?:later|below|in (?:the )?following section))\b/iu;
const IDEA_TOPIC_EXCLUSIONS = new Set(['article', 'document', 'guide', 'point', 'section', 'thing']);
const MODAL_AUXILIARIES = new Set(['must', 'need', 'ought', 'shall', 'should']);
const DECISION_STANDARDS = [
  { term: 'appropriate', pattern: /\bappropriate(?:ly)?\b/giu },
  { term: 'clear', pattern: /\bclear(?:ly)?\b/giu },
  { term: 'complete', pattern: /\bcomplete(?:ly)?\b/giu },
  { term: 'defensible', pattern: /\bdefensible\b/giu },
  { term: 'enough', pattern: /\benough\b/giu },
  { term: 'material', pattern: /\bmaterial(?:ly)?\b/giu },
  { term: 'reasonable', pattern: /\breasonabl(?:e|y)\b/giu },
  { term: 'relevant', pattern: /\brelevan(?:t|ce|cy)\b/giu },
  { term: 'significant', pattern: /\bsignificant(?:ly)?\b/giu },
  { term: 'small', pattern: /\bsmall(?:er|est)?\b/giu },
  { term: 'strong', pattern: /\bstrong(?:er|est)?\b/giu },
  { term: 'sufficient', pattern: /\bsufficient(?:ly)?\b/giu },
  { term: 'suitable', pattern: /\bsuitable\b/giu },
  { term: 'weak', pattern: /\bweak(?:er|est)?\b/giu },
] as const;

function promisedIdea(sentence: Sentence, text: string, start: number, end: number): Omit<OpenIdea, 'id'> | undefined {
  if (!FORWARD_PROMISE_RE.test(text)) return undefined;
  const topics = [...new Set(sentence.words
    .filter((token) => token.start >= start && token.end <= end)
    .filter((token) => token.upos === 'NOUN' || token.upos === 'PROPN')
    .map((token) => entityKey(token))
    .filter((topic) => topic && !IDEA_TOPIC_EXCLUSIONS.has(topic)))];
  return {
    label: text.trim(),
    topics,
    start,
    sentence: sentence.index,
  };
}

function definedDecisionStandards(text: string): Set<string> {
  const defined = new Set<string>();
  for (const { term, pattern } of DECISION_STANDARDS) {
    pattern.lastIndex = 0;
    if (!pattern.test(text)) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const definition = new RegExp(`(?:${escaped}\\s+(?:means|is defined as|refers to)|(?:define|measure|judge|determine|calculate)\\s+(?:what counts as\\s+)?${escaped}\\s+(?:as|by|using|from)|${escaped}\\s*:)`, 'iu');
    if (definition.test(text)) defined.add(term);
  }
  return defined;
}

function isNormativeClause(sentence: Sentence): boolean {
  const root = sentence.dep.tokens.find((token) => token.head === 0);
  if (!root) return false;
  const hasModal = sentence.dep.tokens.some((token) => token.head === root.id
    && token.deprel.split(':', 1)[0] === 'aux'
    && MODAL_AUXILIARIES.has((token.lemma ?? token.form).toLowerCase()));
  if (hasModal) return true;
  const hasSubject = sentence.dep.tokens.some((token) => token.head === root.id
    && ['nsubj', 'csubj'].includes(token.deprel.split(':', 1)[0]!));
  const firstContent = sentence.dep.tokens.find((token) => token.upos !== 'PUNCT');
  return root.upos === 'VERB' && !hasSubject && firstContent?.id === root.id;
}

function usedDecisionStandards(sentence: Sentence, start: number, end: number): OpenDecisionStandard[] {
  if (!isNormativeClause(sentence)) return [];
  return sentence.dep.tokens.flatMap((token) => {
    if (token.start < start || token.end > end || (token.upos !== 'ADJ' && token.upos !== 'ADV')) return [];
    const value = (token.lemma ?? token.form).toLowerCase();
    const standard = DECISION_STANDARDS.find(({ pattern }) => {
      pattern.lastIndex = 0;
      return pattern.test(value);
    });
    if (!standard) return [];
    return [{ term: standard.term, text: token.form, start: token.start, end: token.end, sentence: sentence.index }];
  });
}

/** Build the ordered, source-ranged substrate used by document-level cognitive-load rules. */
export function buildReadingTrace(document: Document): ReadingTrace {
  const cached = readingTraceCache.get(document);
  if (cached) return cached;
  const units = unitRanges(document).map(({ kind, start, end }, index): ReadingUnitTrace => {
    const sentences = document.sentences.filter((sentence) => sentence.end > start && sentence.start < end);
    const tokens = document.tokens.filter((token) => token.start >= start && token.end <= end);
    const entities = tokens
      .filter((token) => token.upos === 'NOUN' || token.upos === 'PROPN')
      .map(mentionFromToken);
    return {
      index,
      kind,
      start,
      end,
      text: document.text.slice(start, end),
      sentences,
      tokens,
      entities,
      propositions: sentences.flatMap(propositionsFor)
        .filter((proposition) => proposition.predicate.start >= start && proposition.predicate.end <= end),
    };
  });
  const propositions = units.flatMap((unit) => unit.propositions);
  const propositionsBySentence = new Map<number, Proposition[]>();
  for (const proposition of propositions) {
    const sentencePropositions = propositionsBySentence.get(proposition.sentence) ?? [];
    sentencePropositions.push(proposition);
    propositionsBySentence.set(proposition.sentence, sentencePropositions);
  }
  const unitBySentence = new Map<number, number>();
  for (const unit of units) {
    for (const sentence of unit.sentences) unitBySentence.set(sentence.index, unit.index);
  }

  const seenEntities = new Set<string>();
  const lastEntitySentence = new Map<string, number>();
  const seenRelationships = new Set<string>();
  const lastRelationshipSentence = new Map<string, number>();
  const lastRoles = new Map<string, ParticipantRole>();
  const activeEntitySentences = new Map<string, number>();
  const activeRelationshipSentences = new Map<string, number>();
  const activeIdeas = new Map<string, OpenIdea>();
  const activeDecisionStandards = new Map<string, OpenDecisionStandard>();
  const definedStandards = new Set<string>();
  let ideaIndex = 0;
  const moments: ReadingMoment[] = [];

  for (const sentence of document.sentences) {
    const unit = unitBySentence.get(sentence.index);
    if (unit === undefined) continue;
    const unitTrace = units[unit]!;
    const momentStart = Math.max(sentence.start, unitTrace.start);
    const momentEnd = Math.min(sentence.end, unitTrace.end);
    const momentText = document.text.slice(momentStart, momentEnd);
    const previousMoment = moments.at(-1);
    const headingBoundaryBefore = previousMoment !== undefined && document.regions.some((region) =>
      region.role === 'heading' && region.start >= previousMoment.end && region.end <= sentence.start);
    const releaseReason: BufferEventReason | undefined = headingBoundaryBefore
      ? 'heading'
      : previousMoment && previousMoment.consolidationCues.length > 0
        ? 'consolidation'
        : undefined;
    const releasedEntities: string[] = [];
    const releasedRelationships: string[] = [];
    const bufferEvents: BufferEvent[] = [];
    if (releaseReason) {
      for (const entity of activeEntitySentences.keys()) {
        releasedEntities.push(entity);
        bufferEvents.push({ kind: 'pop', itemKind: 'entity', key: entity, reason: releaseReason });
      }
      for (const relationship of activeRelationshipSentences.keys()) {
        releasedRelationships.push(relationship);
        bufferEvents.push({ kind: 'pop', itemKind: 'relationship', key: relationship, reason: releaseReason });
      }
      activeEntitySentences.clear();
      activeRelationshipSentences.clear();
    } else {
      for (const [entity, lastSentence] of activeEntitySentences) {
        if (sentence.index - lastSentence <= 2) continue;
        activeEntitySentences.delete(entity);
        releasedEntities.push(entity);
        bufferEvents.push({ kind: 'pop', itemKind: 'entity', key: entity, reason: 'decay' });
      }
      for (const [relationship, lastSentence] of activeRelationshipSentences) {
        if (sentence.index - lastSentence <= 2) continue;
        activeRelationshipSentences.delete(relationship);
        releasedRelationships.push(relationship);
        bufferEvents.push({ kind: 'pop', itemKind: 'relationship', key: relationship, reason: 'decay' });
      }
    }

    const sentenceEntities = new Set(sentence.words
      .filter((token) => token.start >= momentStart && token.end <= momentEnd)
      .filter((token) => token.upos === 'NOUN' || token.upos === 'PROPN')
      .map((token) => entityKey(token))
      .filter(Boolean));
    const ideaEvents: IdeaEvent[] = [];
    const decisionStandardEvents: DecisionStandardEvent[] = [];
    for (const term of definedDecisionStandards(momentText)) {
      definedStandards.add(term);
      const standard = activeDecisionStandards.get(term);
      if (!standard) continue;
      activeDecisionStandards.delete(term);
      decisionStandardEvents.push({ kind: 'pop', standard, reason: 'definition' });
    }
    for (const standard of usedDecisionStandards(sentence, momentStart, momentEnd)) {
      if (definedStandards.has(standard.term) || activeDecisionStandards.has(standard.term)) continue;
      activeDecisionStandards.set(standard.term, standard);
      decisionStandardEvents.push({ kind: 'push', standard, reason: 'judgment-use' });
    }
    for (const [id, idea] of activeIdeas) {
      if (idea.sentence === sentence.index || !idea.topics.some((topic) => sentenceEntities.has(topic))) continue;
      activeIdeas.delete(id);
      ideaEvents.push({ kind: 'pop', idea, reason: 'topic-return' });
    }
    const promise = promisedIdea(sentence, momentText, momentStart, momentEnd);
    if (promise) {
      const idea: OpenIdea = { id: `idea:${ideaIndex++}`, ...promise };
      activeIdeas.set(idea.id, idea);
      ideaEvents.push({ kind: 'push', idea, reason: 'forward-promise' });
    }
    const introducedEntities: string[] = [];
    const reinforcedEntities: string[] = [];
    const reactivatedEntities: string[] = [];
    const entityReactivations: Reactivation[] = [];
    for (const entity of sentenceEntities) {
      const previous = lastEntitySentence.get(entity);
      if (!seenEntities.has(entity)) introducedEntities.push(entity);
      else {
        reinforcedEntities.push(entity);
        if (previous !== undefined && sentence.index - previous >= 4) {
          reactivatedEntities.push(entity);
          entityReactivations.push({ key: entity, inactiveSentences: sentence.index - previous - 1 });
        }
      }
      seenEntities.add(entity);
      lastEntitySentence.set(entity, sentence.index);
      const active = activeEntitySentences.has(entity);
      const eventKind: BufferEventKind = !active && previous !== undefined ? 'reactivate' : active ? 'reinforce' : 'push';
      bufferEvents.push({
        kind: eventKind,
        itemKind: 'entity',
        key: entity,
        reason: eventKind === 'push' ? 'introduction' : 'mention',
      });
      activeEntitySentences.set(entity, sentence.index);
    }

    const sentenceRelationships: TraceRelationship[] = [];
    const roleChanges: RoleChange[] = [];
    for (const proposition of propositionsBySentence.get(sentence.index) ?? []) {
      for (const participant of [...proposition.subjects, ...proposition.objects]) {
        const previous = lastRoles.get(participant.key);
        if (previous && previous !== participant.role) {
          roleChanges.push({ entity: participant.key, from: previous, to: participant.role });
        }
        lastRoles.set(participant.key, participant.role);
      }
      for (const subject of proposition.subjects) {
        if (proposition.objects.length === 0) {
          sentenceRelationships.push({
            key: `${subject.key}->${proposition.predicate.key}`,
            predicate: proposition.predicate.key,
            subject: subject.key,
          });
        } else {
          for (const object of proposition.objects) {
            sentenceRelationships.push({
              key: `${subject.key}->${proposition.predicate.key}->${object.key}`,
              predicate: proposition.predicate.key,
              subject: subject.key,
              object: object.key,
            });
          }
        }
      }
    }
    const newRelationships = sentenceRelationships.filter((relationship) => !seenRelationships.has(relationship.key));
    const reinforcedRelationships = sentenceRelationships.filter((relationship) => seenRelationships.has(relationship.key));
    const relationshipReactivations: Reactivation[] = [];
    for (const relationship of sentenceRelationships) {
      const seen = seenRelationships.has(relationship.key);
      const active = activeRelationshipSentences.has(relationship.key);
      const previous = lastRelationshipSentence.get(relationship.key);
      if (seen && !active && previous !== undefined) {
        relationshipReactivations.push({
          key: relationship.key,
          inactiveSentences: sentence.index - previous - 1,
        });
      }
      const eventKind: BufferEventKind = !active && seen ? 'reactivate' : active ? 'reinforce' : 'push';
      bufferEvents.push({
        kind: eventKind,
        itemKind: 'relationship',
        key: relationship.key,
        reason: eventKind === 'push' ? 'introduction' : 'mention',
      });
      seenRelationships.add(relationship.key);
      lastRelationshipSentence.set(relationship.key, sentence.index);
      activeRelationshipSentences.set(relationship.key, sentence.index);
    }
    const ideaPushes = ideaEvents.filter((event) => event.kind === 'push').length;
    const ideaPops = ideaEvents.filter((event) => event.kind === 'pop').length;
    const decisionPushes = decisionStandardEvents.filter((event) => event.kind === 'push').length;
    const decisionPops = decisionStandardEvents.filter((event) => event.kind === 'pop').length;
    const pushes = bufferEvents.filter((event) => event.kind === 'push').length + ideaPushes + decisionPushes;
    const reinforcements = bufferEvents.filter((event) => event.kind === 'reinforce').length;
    const pops = bufferEvents.filter((event) => event.kind === 'pop').length + ideaPops + decisionPops;
    const reactivations = bufferEvents.filter((event) => event.kind === 'reactivate').length;
    moments.push({
      sentence: sentence.index,
      unit,
      start: momentStart,
      end: momentEnd,
      introducedEntities,
      reinforcedEntities,
      reactivatedEntities,
      entityReactivations,
      newRelationships,
      reinforcedRelationships,
      relationshipReactivations,
      roleChanges,
      releasedEntities,
      releasedRelationships,
      bufferEvents,
      ideaEvents,
      activeIdeas: [...activeIdeas.values()],
      decisionStandardEvents,
      activeDecisionStandards: [...activeDecisionStandards.values()],
      load: {
        pushes,
        reinforcements,
        pops,
        reactivations,
        activeEntityFrames: activeEntitySentences.size,
        activeRelationshipFrames: activeRelationshipSentences.size,
        openIdeaFrames: activeIdeas.size,
        openDecisionFrames: activeDecisionStandards.size,
        roleChanges: roleChanges.length,
        netInflow: pushes + reactivations - pops,
      },
      activeEntities: [...activeEntitySentences.keys()],
      activeRelationships: [...activeRelationshipSentences.keys()],
      structuralBoundaryBefore: previousMoment !== undefined && previousMoment.unit !== unit,
      headingBoundaryBefore,
      consolidationCues: consolidationCues(momentText),
    });
  }

  const trace = { units, propositions, moments };
  readingTraceCache.set(document, trace);
  return trace;
}
