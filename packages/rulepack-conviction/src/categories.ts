/**
 * The categories the conviction rules group under. Like the ai-style pack's
 * categories, these ids are stable identifiers — the web UI colours highlights
 * with them — not just labels.
 */
import type { Category } from "writinglint-core";

export const CATEGORIES: Record<string, Category> = {
    hedging: {
        id: "hedging",
        label: "Hedging",
        blurb: "Apologising for the claim before making it — softeners, hedged openers, undercutting asides.",
        weight: 3
    },
    evidence: {
        id: "evidence",
        label: "Verdict without evidence",
        blurb: "Conclusions handed to the reader with the event that produced them missing.",
        weight: 2.5
    },
    posture: {
        id: "posture",
        label: "Posture",
        blurb: "Flinching in print — apologising to a reader who hasn’t objected.",
        weight: 2
    }
};

/** Display / overlap-priority order (earlier = higher priority when marks collide). */
export const CATEGORY_ORDER: string[] = ["hedging", "evidence", "posture"];
