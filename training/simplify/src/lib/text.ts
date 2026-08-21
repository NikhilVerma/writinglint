// Emoji crash slopsift's region math (invalid UTF-16 source ranges, see
// trial-001 source 824315274229), so every text that enters the pipeline is
// stripped: generated sources, drafts before linting, and chat-fixer output.
// Matches full sequences: base pictograph + skin tones/VS16, joined by ZWJ.
const emojiSequence =
  '\\p{Extended_Pictographic}(?:[\\u{1F3FB}-\\u{1F3FF}\\uFE0F])*(?:\\u200D\\p{Extended_Pictographic}(?:[\\u{1F3FB}-\\u{1F3FF}\\uFE0F])*)*';

// Screening thresholds calibrated against the trial-001 human review:
// degenerate repetition-loop output scored 0.94 (keepers max 0.03); a pure
// code dump scored 0.15 prose (keepers 0.55+). README-style docs around 0.55
// overlap with keepers and are left to judges and humans.
export const maxRepetitionRatio = 0.3;
export const minProseRatio = 0.4;

/** Share of word characters that survive removing code, tables, and HTML. */
export function proseRatio(text: string): number {
  const noFences = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '');
  const kept: string[] = [];
  for (const line of noFences.split('\n')) {
    const s = line.trim();
    if (s.startsWith('|') || s.startsWith('<') || /^[-=+*_|:\s]+$/.test(s === '' ? '-' : s)) continue;
    kept.push(line.replace(/<[^>]+>/g, ''));
  }
  const prose = (kept.join('\n').match(/\w/g) ?? []).length;
  const total = (text.match(/\w/g) ?? []).length;
  return total === 0 ? 0 : prose / total;
}

/** Share of duplicate word 5-grams; degenerate generation loops score high. */
export function repetitionRatio(text: string, n = 5): number {
  const words = (text.toLowerCase().match(/\w+/g) ?? []);
  if (words.length < n * 4) return 0;
  const grams: string[] = [];
  for (let i = 0; i <= words.length - n; i++) grams.push(words.slice(i, i + n).join(' '));
  return 1 - new Set(grams).size / grams.length;
}

export function stripEmoji(text: string): string {
  return text
    .replace(new RegExp(` ?${emojiSequence}`, 'gu'), '')
    .replace(/(\S) {2,}/g, '$1 ')
    .replace(/ +([.,;:!?])/g, '$1')
    .replace(/^ (?=\S)/gm, '')
    .replace(/ +$/gm, '');
}

/**
 * Model output arrives fenced, or carrying emoji, or both. Strip that wrapper
 * before any scoring so slopsift, the judges, and the reward all see the same
 * text. A whole answer wrapped in ```markdown otherwise reads as pure code.
 */
export function normalizeOutput(text: string): string {
  // A reasoning model narrates before it answers. The rewrite is what follows
  // the think block, and scoring the reasoning with it halves the measured echo
  // and inflates the length ratio, so drop it. An unclosed block means the
  // model ran out of budget mid-thought and never reached the rewrite.
  let clean = text.trim();
  if (clean.includes('</think>')) clean = clean.slice(clean.lastIndexOf('</think>') + '</think>'.length);
  else if (clean.startsWith('<think>')) clean = '';
  clean = stripEmoji(clean.trim());
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```[a-z]*\r?\n/i, '').replace(/\r?\n```\s*$/, '');
  }
  return clean.trim();
}
