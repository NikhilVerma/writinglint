import { defineRule, type Lint, type Paragraph } from 'writinglint-core';

const overlaps = (lint: Lint, paragraph: Paragraph): boolean => lint.end > paragraph.start && lint.start < paragraph.end;
const SUPPORT_ONLY = new Set(['ai-style/absolute-claim', 'ai-style/passive-actor-hiding', 'ai-style/em-dash-overuse']);
const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;
const evidenceWeight = (lint: Lint): number => {
  if (lint.confidence === 'high') return 3;
  if (lint.confidence === 'medium') return 2;
  return SUPPORT_ONLY.has(lint.ruleId) ? 0.25 : 1;
};
const independentHits = (hits: Lint[]): Lint[] => {
  const kept: Lint[] = [];
  for (const hit of [...hits].sort((left, right) => left.start - right.start || left.end - right.end)) {
    const duplicate = kept.findIndex((other) => {
      const intersection = Math.max(0, Math.min(hit.end, other.end) - Math.max(hit.start, other.start));
      const shorter = Math.min(hit.end - hit.start, other.end - other.start);
      return Math.max(hit.end - hit.start, other.end - other.start) <= 120 && shorter > 0 && intersection / shorter >= 0.8;
    });
    if (duplicate === -1) kept.push(hit);
    else if (evidenceWeight(hit) > evidenceWeight(kept[duplicate]!)) kept[duplicate] = hit;
  }
  return kept;
};

/** Combine independent weak signals that become persuasive only in context. */
export const evidenceCluster = defineRule({
  meta: {
    name: 'evidence-cluster',
    category: 'evidence',
    docs: { description: 'Several independent slop signals cluster in one paragraph or across the document.' },
  },
  create(ctx) {
    return {
      DocumentExit(doc) {
        const source = ctx.findings.filter((lint) => lint.ruleId !== ctx.ruleId);
        let paragraphClusters = 0;
        for (const paragraph of doc.paragraphs) {
          const hits = independentHits(source.filter((lint) => overlaps(lint, paragraph)));
          const rules = new Set(hits.map((lint) => lint.ruleId));
          const categories = new Set(hits.map((lint) => lint.category));
          const substantialRules = new Set(hits.filter((lint) => !SUPPORT_ONLY.has(lint.ruleId)).map((lint) => lint.ruleId));
          const score = hits.reduce((sum, lint) => sum + evidenceWeight(lint), 0);
          if (score < 4 || rules.size < 2 || substantialRules.size < 2 || categories.size < 2) continue;
          const high = score >= 9 && rules.size >= 3 && substantialRules.size >= 2 && categories.size >= 3;
          paragraphClusters++;
          const labels = [...rules].slice(0, 4).map((rule) => rule.slice(rule.indexOf('/') + 1));
          ctx.report({
            span: { start: paragraph.start, end: paragraph.end },
            confidence: high ? 'high' : 'medium',
            message: `${high ? 'Dense' : 'Likely'} slop cluster: ${hits.length} signals across ${rules.size} rule families (${labels.join(', ')}${rules.size > labels.length ? ', …' : ''}). The paragraph reads differently when these weak tells are considered together.`,
          });
        }

        const rules = new Set(source.map((lint) => lint.ruleId));
        const categories = new Set(source.map((lint) => lint.category));
        const substantialRules = new Set(source.filter((lint) => !SUPPORT_ONLY.has(lint.ruleId)).map((lint) => lint.ruleId));
        const score = source.reduce((sum, lint) => sum + evidenceWeight(lint), 0);
        if (score < 12 || rules.size < 5 || substantialRules.size < 4 || categories.size < 3 || paragraphClusters >= 2) return;
        // Put the document-level diagnostic on the strongest useful signal,
        // rather than an incidental early low-confidence match or footnote.
        const anchor = [...source].sort((left, right) =>
          CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence]
          || left.start - right.start)[0];
        if (!anchor) return;
        ctx.report({
          span: { start: anchor.start, end: anchor.end },
          confidence: 'medium',
          message: `Document-level slop pattern: ${source.length} signals across ${rules.size} rule families are distributed through the piece. No single sentence proves it; the repeated combined pattern does.`,
        });
      },
    };
  },
});
