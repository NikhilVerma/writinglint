/**
 * Linter worker — runs the heavy work (ONNX dependency parse + rules + score)
 * off the UI thread, so long documents no longer freeze the page. onnxruntime-web
 * and the transformers.js tokenizer both run fine in a worker (all asset loads are
 * same-origin fetches). The main thread only sends text and renders the result.
 */
import { Linter, resolveConfig, type Lint, type ResolvedConfig } from "writinglint-core";
import { recommended as aiStyle, score } from "writinglint-rulepack-ai-style";
import type { Model } from "writinglint-rulepack-ai-style";
import { recommended as conviction } from "writinglint-rulepack-conviction";
import { loadEngine } from "./parser-browser.js";

/** The rulepacks the demo can lint with, keyed by the id the UI sends. */
export type PackId = "ai-style" | "conviction";

// Messages the worker receives / sends.
type InMsg = { type: "lint"; id: number; text: string; pack?: PackId };
type OutMsg =
    | { type: "progress"; stage: string; loaded?: number; total?: number }
    | { type: "ready" }
    | { type: "error"; message: string }
    | { type: "lint-error"; id: number; message: string }
    | {
          type: "result";
          id: number;
          lints: Lint[];
          score: number;
          verdict: string;
          words: number;
          sentences: number;
      };

// `self` in a module worker is the WorkerGlobalScope; type it narrowly for
// postMessage without pulling in the WebWorker lib (which conflicts with DOM).
const post = (m: OutMsg): void =>
    (self as unknown as { postMessage(x: unknown): void }).postMessage(m);

let linter: Linter | undefined;
let configs: Record<PackId, ResolvedConfig> | undefined;
let model: Model | undefined;

async function init(): Promise<void> {
    try {
        const engine = await loadEngine((stage, loaded, total) =>
            post({ type: "progress", stage, loaded, total })
        );
        linter = new Linter(engine.parser);
        configs = { "ai-style": resolveConfig(aiStyle), conviction: resolveConfig(conviction) };
        model = engine.model;
        post({ type: "ready" });
    } catch (err) {
        post({ type: "error", message: (err as Error).message });
    }
}

self.addEventListener("message", (ev) => {
    const msg = (ev as MessageEvent).data as InMsg;
    if (msg.type !== "lint" || !linter || !configs) return;
    void (async () => {
        // ALWAYS reply — even on failure — so the main thread can reset its
        // in-flight state and stop the "Linting…" spinner. A swallowed rejection
        // here would otherwise hang the indicator forever.
        try {
            const config = configs![msg.pack ?? "ai-style"];
            const { doc, lints } = await linter!.lint(msg.text, config);
            const s = score(doc, lints, model);
            post({
                type: "result",
                id: msg.id,
                lints,
                score: s.score,
                verdict: s.verdict,
                words: doc.tokens.length,
                sentences: doc.sentences.length
            });
        } catch (err) {
            post({ type: "lint-error", id: msg.id, message: (err as Error).message });
        }
    })();
});

void init();
