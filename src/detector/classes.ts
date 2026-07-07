/**
 * Word-CLASSES — the "slots" that productive AI constructions fill.
 *
 * The point of the detector is to flag *constructions*, not memorized strings.
 * "Experts argue" and "people argue" are the same tell (unnamed authority +
 * claim verb); "important to note" and "critical to note" are the same tell
 * (importance adjective + cognition verb). So rules are assembled as templates
 * over these classes rather than enumerating every surface phrase — which also
 * closes the paraphrase gap that lets subtle AI slip past a fixed phrase list.
 *
 * Classes are closed lists chosen for PRECISION: collective/plural authorities
 * (the weasel signal) rather than specific ones, argumentation verbs rather
 * than every verb a person could follow "people" with.
 */

/** Unnamed collective authorities — the weasel "who says so?" slot. */
export const VAGUE_AUTHORITY = [
  'experts',
  'analysts',
  'observers',
  'critics',
  'scientists',
  'researchers',
  'historians',
  'economists',
  'scholars',
  'commentators',
  'authorities',
  'pundits',
  'professionals',
  'specialists',
  'insiders',
  'advocates',
  'supporters',
  'detractors',
  'people',
  'sources',
  'studies',
  'reports',
  'surveys',
  'polls',
  'research',
  'evidence',
  'data',
  'many',
  'some',
  'others',
];

/** Quantifiers that can precede an authority ("a growing number of experts"). */
export const QUANTIFIER = [
  'many',
  'some',
  'most',
  'several',
  'various',
  'numerous',
  'countless',
  'a number of',
  'a growing number of',
  'a handful of',
  'plenty of',
  'a wide range of',
];

/** Argumentation / attribution verbs (present + past). */
export const CLAIM_VERB = [
  'argue',
  'argues',
  'argued',
  'say',
  'says',
  'said',
  'claim',
  'claims',
  'claimed',
  'believe',
  'believes',
  'believed',
  'suggest',
  'suggests',
  'suggested',
  'contend',
  'contends',
  'maintain',
  'maintains',
  'assert',
  'asserts',
  'agree',
  'agrees',
  'insist',
  'insists',
  'report',
  'reports',
  'reported',
  'observe',
  'observes',
  'observed',
  'estimate',
  'estimates',
  'warn',
  'warns',
  'predict',
  'predicts',
  'indicate',
  'indicates',
  'reveal',
  'reveals',
  'show',
  'shows',
  'note',
  'notes',
  'point out',
  'points out',
];

/** Importance adjectives for the "it's ___ to note" throat-clearing slot. */
export const IMPORTANCE_ADJ = [
  'important',
  'critical',
  'crucial',
  'essential',
  'vital',
  'key',
  'necessary',
  'noteworthy',
  'worthwhile',
  'useful',
  'helpful',
  'significant',
  'imperative',
  'interesting',
];

/** Cognition verbs (base form) for "it's important to ___". */
export const COGNITION_VERB = [
  'note',
  'mention',
  'remember',
  'understand',
  'consider',
  'recognize',
  'recognise',
  'realize',
  'realise',
  'appreciate',
  'emphasize',
  'emphasise',
  'highlight',
  'acknowledge',
  'stress',
  'underscore',
  'point out',
  'keep in mind',
  'bear in mind',
];

/** Cognition verbs as gerunds, for "it's worth noting". */
export const COGNITION_ING = [
  'noting',
  'mentioning',
  'remembering',
  'considering',
  'highlighting',
  'emphasizing',
  'emphasising',
  'pointing out',
  'keeping in mind',
  'bearing in mind',
];

/** Cognition verbs as past participles, for "it should be noted that". */
export const COGNITION_ED = [
  'noted',
  'mentioned',
  'remembered',
  'emphasized',
  'emphasised',
  'stressed',
  'highlighted',
  'understood',
  'recognized',
  'recognised',
  'acknowledged',
  'pointed out',
];

/** Adjectives that fill "plays a ___ role". */
export const SIGNIFICANCE_ADJ = [
  'vital',
  'crucial',
  'pivotal',
  'significant',
  'key',
  'central',
  'integral',
  'essential',
  'important',
  'major',
  'prominent',
  'defining',
  'leading',
  'instrumental',
  'critical',
  'decisive',
];

/** Copula-avoidance verbs that front "___ as a testament/beacon/…". */
export const COPULA_AS_VERB = ['stands', 'serves', 'acts', 'functions', 'emerges'];

/** The grand nouns those copulas reach for. */
export const MONUMENT_NOUN = [
  'testament',
  'reminder',
  'symbol',
  'beacon',
  'cornerstone',
  'hallmark',
  'gateway',
  'catalyst',
  'bridge',
  'milestone',
  'landmark',
];
