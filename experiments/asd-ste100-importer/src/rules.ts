import { contentBlocks } from './content.js';
import type {
  OrderedNode,
  OrderedTextNode,
  ParseIssue,
  RuleRecord,
  RuleSection,
} from './types.js';

const PART_ONE = 'Part 1 - Writing rules';
const PART_TWO = 'Part 2 - Dictionary';
const SECTION_PATTERN = /^Section\s+(\d+)\s+-\s+(.+)$/u;
const COMPLETE_RULE_PATTERN = /^Rule\s+(\d+\.\d+)\s+(.+)$/u;

function textNode(node: OrderedNode): node is OrderedTextNode {
  return node.kind === 'text';
}

function lastHeadingIndex(nodes: readonly OrderedNode[], text: string): number {
  let found = -1;
  for (const [index, node] of nodes.entries()) {
    if (textNode(node) && node.label === 'section_header' && node.text.trim() === text) found = index;
  }
  return found;
}

export interface WritingRuleBoundaries {
  partOne: number;
  partTwo: number;
}

export function writingRuleBoundaries(nodes: readonly OrderedNode[]): WritingRuleBoundaries {
  const partOne = lastHeadingIndex(nodes, PART_ONE);
  const partTwo = lastHeadingIndex(nodes, PART_TWO);
  if (partOne === -1) throw new Error(`Could not find ${PART_ONE}.`);
  if (partTwo === -1 || partTwo <= partOne) throw new Error(`Could not find ${PART_TWO} after ${PART_ONE}.`);
  return { partOne, partTwo };
}

interface RuleCandidate {
  id: string;
  title: string;
  index: number;
  node: OrderedTextNode;
}

function selectRuleCandidates(
  nodes: readonly OrderedNode[],
  boundaries: WritingRuleBoundaries,
): RuleCandidate[] {
  const candidates = new Map<string, RuleCandidate[]>();
  for (let index = boundaries.partOne + 1; index < boundaries.partTwo; index += 1) {
    const node = nodes[index]!;
    if (!textNode(node)) continue;
    const match = node.text.trim().match(COMPLETE_RULE_PATTERN);
    if (!match) continue;
    const candidate = { id: match[1]!, title: node.text.trim(), index, node };
    const grouped = candidates.get(candidate.id) ?? [];
    grouped.push(candidate);
    candidates.set(candidate.id, grouped);
  }

  return [...candidates.values()]
    .map((group) => [...group].sort((left, right) => {
      const labelDifference = Number(right.node.label === 'section_header')
        - Number(left.node.label === 'section_header');
      return labelDifference || right.index - left.index;
    })[0]!)
    .sort((left, right) => left.index - right.index);
}

interface SectionBoundary {
  number: number;
  title: string;
  index: number;
  node: OrderedTextNode;
}

function sectionBoundaries(
  nodes: readonly OrderedNode[],
  boundaries: WritingRuleBoundaries,
): SectionBoundary[] {
  const sections: SectionBoundary[] = [];
  for (let index = boundaries.partOne + 1; index < boundaries.partTwo; index += 1) {
    const node = nodes[index]!;
    if (!textNode(node) || node.label !== 'section_header') continue;
    const match = node.text.trim().match(SECTION_PATTERN);
    if (!match) continue;
    sections.push({ number: Number(match[1]), title: match[2]!, index, node });
  }
  return sections;
}

function sectionForRule(sections: readonly SectionBoundary[], rule: RuleCandidate): SectionBoundary | undefined {
  return [...sections].reverse().find(({ index }) => index < rule.index);
}

export function parseWritingRules(
  nodes: readonly OrderedNode[],
  issues: ParseIssue[],
): { sections: RuleSection[]; rules: RuleRecord[]; boundaries: WritingRuleBoundaries } {
  const boundaries = writingRuleBoundaries(nodes);
  const selectedRules = selectRuleCandidates(nodes, boundaries);
  const selectedSections = sectionBoundaries(nodes, boundaries);
  const rules: RuleRecord[] = [];

  for (const [ruleIndex, candidate] of selectedRules.entries()) {
    const section = sectionForRule(selectedSections, candidate);
    if (!section) {
      issues.push({
        severity: 'error',
        code: 'rule-without-section',
        message: `Rule ${candidate.id} does not have a preceding section.`,
        source: candidate.node.source,
      });
      continue;
    }
    const nextRuleIndex = selectedRules[ruleIndex + 1]?.index ?? boundaries.partTwo;
    const nextSectionIndex = selectedSections.find(({ index }) => index > candidate.index)?.index
      ?? boundaries.partTwo;
    const contentEnd = Math.min(nextRuleIndex, nextSectionIndex);
    rules.push({
      id: candidate.id,
      title: candidate.title,
      section: section.number,
      sectionTitle: section.title,
      source: candidate.node.source,
      blocks: contentBlocks(nodes.slice(candidate.index + 1, contentEnd)),
    });
  }

  const sections = selectedSections.map((section) => ({
    number: section.number,
    title: section.title,
    source: section.node.source,
    rules: rules.filter(({ section: sectionNumber }) => sectionNumber === section.number),
  }));

  return { sections, rules, boundaries };
}
