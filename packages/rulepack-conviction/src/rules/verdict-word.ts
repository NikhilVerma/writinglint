/**
 * Verdict word — words that hand the reader a conclusion while hiding the event
 * that produced it: "in an unbiased way", "handles it properly", "a robust
 * pipeline". Each is an IOU for a concrete scene not yet written. The fix is
 * always the same question: like what? Show the event; the reader will reach
 * the verdict themselves — and believe it more, because it's now theirs.
 */
import { defineRule } from "writinglint-core";

const VERDICT_WORDS = new Set([
    "unbiased",
    "properly",
    "correctly",
    "reliably",
    "effectively",
    "seamlessly",
    "robust",
    "robustly",
    "accurately",
    "appropriately",
    "efficiently",
    "unacceptable",
    "suboptimal",
    "problematic",
    "meaningful",
    "meaningfully"
]);

export const verdictWord = defineRule({
    meta: {
        name: "verdict-word",
        category: "evidence",
        docs: {
            description:
                "Verdict words (“unbiased”, “properly”, “robust”) are IOUs for a concrete scene. Ask “like what?” and write the event instead."
        },
        defaultSeverity: "warn"
    },
    create(ctx) {
        return {
            Token(tok) {
                if (!VERDICT_WORDS.has(tok.lower)) return;
                ctx.report({
                    span: { start: tok.start, end: tok.end },
                    message: `“${tok.text}” is a verdict, not an event — an IOU for a scene you haven't written. What did you actually see happen? Show that; the reader will reach the verdict themselves.`
                });
            }
        };
    }
});
