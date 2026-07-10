import "./demo.css";
import { segments, type Lint } from "writinglint-core";
import {
    CATEGORIES as AI_CATEGORIES,
    CATEGORY_ORDER as AI_CATEGORY_ORDER
} from "writinglint-rulepack-ai-style";
import {
    CATEGORIES as CONVICTION_CATEGORIES,
    CATEGORY_ORDER as CONVICTION_CATEGORY_ORDER
} from "writinglint-rulepack-conviction";
import { AI_PITCH, HUMAN_PITCH, HEDGED_PITCH, COMMITTED_PITCH } from "./examples.js";
import { AI_LINTS, HUMAN_LINTS } from "./precomputed-lints.js";
import type { PackId } from "./worker.js";

// Category ids are globally unique across packs, so the UI can hold one merged
// map and colour marks from either pack without knowing which is active.
const CATEGORIES = { ...AI_CATEGORIES, ...CONVICTION_CATEGORIES };
const CATEGORY_ORDER = [...AI_CATEGORY_ORDER, ...CONVICTION_CATEGORY_ORDER];

/** Everything pack-specific the demo swaps when the rulepack dropdown changes. */
const PACKS: Record<
    PackId,
    {
        flagged: { label: string; text: string };
        clean: { label: string; text: string };
        lead: string;
    }
> = {
    "ai-style": {
        flagged: { label: "AI draft", text: AI_PITCH },
        clean: { label: "Human draft", text: HUMAN_PITCH },
        lead: "A grammar linter for prose. This manuscript is an <strong>AI-written pitch</strong> for the project itself — every underline is a structural tell WritingLint caught. Edit it, or switch to the human-edited draft and watch the marks fall away. Everything runs in your browser."
    },
    conviction: {
        flagged: { label: "Hedged draft", text: HEDGED_PITCH },
        clean: { label: "Committed draft", text: COMMITTED_PITCH },
        lead: "The <strong>conviction</strong> rulepack catches writing that doesn’t commit — hedged openers, softened claims, verdicts with the evidence missing, apologies to a reader who hasn’t objected. Same argument in both drafts; only the posture changes."
    }
};

/*
 * The "Proof" demo — a prose manuscript linted live, no code editor.
 *
 * The manuscript is a transparent <textarea> stacked over a backdrop <div> that
 * paints the same text with category-coloured proof-mark underlines (built from
 * the engine's `segments()`). Identical font metrics keep the two in register, so
 * you edit real text and the marks track it — with none of Monaco's DOM to fight.
 * A diagnostics rail lists every tell; hovering a diagnostic lights its mark.
 */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const host = document.getElementById("bw-manuscript");
if (host) boot();

function boot(): void {
    const input = $<HTMLTextAreaElement>("bw-input");
    const backdrop = $<HTMLDivElement>("bw-backdrop");
    const rail = $<HTMLDivElement>("bw-diagnostics");
    const count = $<HTMLSpanElement>("bw-count");
    const status = $<HTMLSpanElement>("bw-status");
    const copyBtn = $<HTMLButtonElement>("bw-copy");
    const loading = $<HTMLDivElement>("bw-loading");
    const loadBar = $<HTMLDivElement>("bw-loadbar");
    const loadMsg = $<HTMLDivElement>("bw-loadmsg");
    const segButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-draft]")];
    const packSel = $<HTMLSelectElement>("bw-pack");
    const lead = $<HTMLParagraphElement>("bw-lead");

    // The active rulepack. Every lint request carries it; switching packs swaps
    // the example drafts, their button labels, and the lead copy.
    let pack: PackId = "ai-style";

    function applyPack(next: PackId): void {
        pack = next;
        const p = PACKS[next];
        for (const b of segButtons) {
            b.textContent = b.dataset.draft === "clean" ? p.clean.label : p.flagged.label;
        }
        lead.innerHTML = p.lead;
    }

    // Overlap priority for segments(): earlier category id wins the character.
    const PRIORITY = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));
    const priorityOf = (l: Lint) => PRIORITY.get(l.category) ?? 99;

    const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
    const escape = (s: string) => s.replace(/[&<>]/g, (c) => ESC[c]);

    // ── worker protocol (mirror of src/client/worker.ts) ──────────────────────
    interface LintResult {
        type: "result";
        id: number;
        lints: Lint[];
        score: number;
        verdict: string;
        words: number;
        sentences: number;
    }
    type WorkerMsg =
        | { type: "progress"; stage: string; loaded?: number; total?: number }
        | { type: "ready" }
        | { type: "error"; message: string }
        | { type: "lint-error"; id: number; message: string }
        | LintResult;

    let lastLints: Lint[] = [];
    let ready = false;
    let reqId = 0;
    let lastSent = 0;
    let sentText = "";
    let inFlight = false;
    let pending = false;
    let firstPaint = true;
    let live = false; // true once the real engine worker is running
    let worker: Worker | undefined;

    const setLinting = (on: boolean) => {
        status.hidden = !on;
    };

    // ── paint the manuscript backdrop (underlines) from segments() ─────────────
    function paintBackdrop(text: string, lints: Lint[]): void {
        const segs = segments(text, lints, priorityOf);
        let html = "";
        for (const s of segs) {
            const raw = escape(text.slice(s.start, s.end)) || "";
            if (!s.lint) {
                html += raw;
                continue;
            }
            const i = lints.indexOf(s.lint);
            html += `<span class="bw-tell bw-tell--${s.lint.category}" data-i="${i}">${raw}</span>`;
        }
        // Trailing newline keeps the backdrop's scroll height in step with the textarea.
        backdrop.innerHTML = html + "\n";
    }

    // ── the diagnostics rail ──────────────────────────────────────────────────
    function renderRail(lints: Lint[]): void {
        count.textContent = String(lints.length);
        copyBtn.disabled = lints.length === 0;
        if (lints.length === 0) {
            rail.innerHTML = `<p class="bw-rail__empty">No tells found.<br /><span>Reads clean.</span></p>`;
            return;
        }
        const rows = lints
            .map((l, i) => ({ l, i, line: lineColOf(sentText, l.start) }))
            .sort((a, b) => a.l.start - b.l.start);
        let html = "";
        for (const { l, i, line } of rows) {
            const label = CATEGORIES[l.category]?.label ?? l.category;
            html += `<button class="bw-diag" data-i="${i}" type="button" title="${escape(label)}">
        <span class="bw-diag__dot bw-dot--${l.category}"></span>
        <span class="bw-diag__body">
          <span class="bw-diag__msg">${escape(l.message)}</span>
          <span class="bw-diag__meta"><span class="bw-diag__rule">${escape(l.ruleId)}</span><span class="bw-diag__loc">${line.line}:${line.col}</span></span>
        </span>
      </button>`;
        }
        rail.innerHTML = html;
    }

    function lineColOf(text: string, offset: number): { line: number; col: number } {
        let line = 1,
            col = 1;
        for (let i = 0; i < offset && i < text.length; i++) {
            if (text[i] === "\n") {
                line++;
                col = 1;
            } else col++;
        }
        return { line, col };
    }

    // ── cross-highlight: hover a diagnostic → light its mark(s) ────────────────
    const marksFor = (i: number) =>
        backdrop.querySelectorAll<HTMLElement>(`.bw-tell[data-i="${i}"]`);
    rail.addEventListener("mouseover", (e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>(".bw-diag");
        if (!row) return;
        marksFor(Number(row.dataset.i)).forEach((m) => m.classList.add("is-active"));
    });
    rail.addEventListener("mouseout", (e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>(".bw-diag");
        if (!row) return;
        marksFor(Number(row.dataset.i)).forEach((m) => m.classList.remove("is-active"));
    });
    rail.addEventListener("click", (e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>(".bw-diag");
        if (!row) return;
        const mark = backdrop.querySelector<HTMLElement>(`.bw-tell[data-i="${row.dataset.i}"]`);
        if (mark) {
            input.scrollTop = Math.max(0, mark.offsetTop - input.clientHeight / 2);
            backdrop.scrollTop = input.scrollTop;
            mark.classList.remove("bw-pulse");
            void mark.offsetWidth;
            mark.classList.add("bw-pulse");
        }
        input.focus();
    });

    // ── keep backdrop scroll locked to the textarea ───────────────────────────
    input.addEventListener("scroll", () => {
        backdrop.scrollTop = input.scrollTop;
        backdrop.scrollLeft = input.scrollLeft;
    });

    // ── copy all ──────────────────────────────────────────────────────────────
    copyBtn.addEventListener("click", async () => {
        if (!lastLints.length) return;
        const lines = [...lastLints]
            .sort((a, b) => a.start - b.start)
            .map((l) => {
                const { line, col } = lineColOf(sentText, l.start);
                const label = CATEGORIES[l.category]?.label ?? l.category;
                return `${line}:${col}\t${l.ruleId}\t${label}: ${l.message}\t“${l.text.replace(/\s+/g, " ").trim()}”`;
            });
        try {
            await navigator.clipboard.writeText(
                `WritingLint — ${lines.length} problem${lines.length > 1 ? "s" : ""}\n${lines.join("\n")}\n`
            );
            const prev = copyBtn.textContent;
            copyBtn.textContent = "Copied";
            window.setTimeout(() => {
                copyBtn.textContent = prev;
            }, 1200);
        } catch {
            /* clipboard blocked */
        }
    });

    // ── lint request/coalesce (single in-flight) ──────────────────────────────
    function requestLint(): void {
        if (!ready || !worker) return;
        if (input.value.trim() === "") {
            clearAll();
            return;
        }
        if (inFlight) {
            pending = true;
            return;
        }
        inFlight = true;
        setLinting(true);
        lastSent = ++reqId;
        sentText = input.value;
        worker.postMessage({ type: "lint", id: lastSent, text: sentText, pack });
    }
    function clearAll(): void {
        lastSent = ++reqId;
        lastLints = [];
        sentText = input.value;
        paintBackdrop(input.value, []);
        renderRail([]);
        setLinting(false);
    }
    function settle(): void {
        inFlight = false;
        if (pending) {
            pending = false;
            requestLint();
        } else setLinting(false);
    }
    function renderResult(msg: LintResult): void {
        if (input.value !== sentText) return; // offsets only line up with the linted text
        lastLints = msg.lints;
        paintBackdrop(sentText, msg.lints);
        renderRail(msg.lints);
        if (firstPaint) {
            firstPaint = false;
            backdrop.classList.add("bw-drawin");
        }
    }

    let timer = 0;
    const onEdit = () => {
        // Keep the backdrop text in sync (so scroll height matches) but drop the marks
        // while typing — they'd sit at stale offsets. The relint repaints them.
        paintBackdrop(input.value, []);
        window.clearTimeout(timer);
        if (input.value.trim() === "") {
            clearAll();
            return;
        }
        timer = window.setTimeout(requestLint, 350);
    };
    input.addEventListener("input", onEdit);

    function loadDraft(text: string, btn?: HTMLButtonElement): void {
        input.value = text;
        segButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        window.clearTimeout(timer);
        input.scrollTop = 0;
        backdrop.scrollTop = 0;
        if (live) {
            paintBackdrop(text, []);
            requestLint();
        } else {
            // Static preview (iOS): swap to the precomputed marks for the chosen draft.
            // Only the ai-style drafts have precomputed lints; the pack selector is
            // disabled on the static path, so these are the only texts we can see.
            const lints = text === HUMAN_PITCH ? HUMAN_LINTS : AI_LINTS;
            sentText = text;
            lastLints = lints;
            paintBackdrop(text, lints);
            renderRail(lints);
        }
    }
    segButtons.forEach((b) =>
        b.addEventListener("click", () => {
            const p = PACKS[pack];
            loadDraft(b.dataset.draft === "clean" ? p.clean.text : p.flagged.text, b);
        })
    );
    packSel.addEventListener("change", () => {
        applyPack(packSel.value === "conviction" ? "conviction" : "ai-style");
        // A new pack means new rules: load its flagged draft so the switch shows something.
        loadDraft(
            PACKS[pack].flagged.text,
            segButtons.find((b) => b.dataset.draft === "flagged")
        );
    });
    // Editing frees you from a preset.
    input.addEventListener(
        "input",
        () => segButtons.forEach((b) => b.setAttribute("aria-pressed", "false")),
        { once: false }
    );

    // ── boot the linter worker ────────────────────────────────────────────────
    const FMT = (n: number) => `${(n / 1_000_000).toFixed(0)} MB`;
    const STAGE: Record<string, string> = {
        tokenizer: "Loading tokenizer",
        classifier: "Loading detector",
        model: "Downloading parser",
        compiling: "Compiling parser",
        ready: "Ready"
    };
    function onProgress(stage: string, loaded?: number, total?: number): void {
        loadMsg.textContent =
            stage === "model" && total
                ? `Downloading parser · ${FMT(loaded ?? 0)} / ${FMT(total)}`
                : (STAGE[stage] ?? stage);
        const pct =
            stage === "model" && total ? (loaded ?? 0) / total : stage === "ready" ? 1 : undefined;
        if (pct !== undefined) loadBar.style.width = `${Math.round(pct * 100)}%`;
    }

    // Spin up the real engine worker and go live. Called immediately on desktop, or
    // on explicit opt-in on iOS (where auto-loading the 145 MB model kills the tab).
    function startLive(): void {
        if (live) return;
        live = true;
        input.readOnly = false;
        packSel.disabled = false;
        host?.classList.remove("bw-demo--static");
        loading.classList.remove("done", "error");
        loadBar.style.width = "0%";
        loadMsg.textContent = "Starting";
        paintBackdrop(input.value, []);
        worker = new Worker("/worker.js", { type: "module" });
        worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
            const msg = e.data;
            if (msg.type === "progress") onProgress(msg.stage, msg.loaded, msg.total);
            else if (msg.type === "ready") {
                ready = true;
                loading.classList.add("done");
                requestLint();
            } else if (msg.type === "result") {
                if (msg.id === lastSent) renderResult(msg);
                settle();
            } else if (msg.type === "lint-error") {
                console.warn("lint failed:", msg.message);
                settle();
            } else if (msg.type === "error") {
                loadMsg.textContent = `Failed to load: ${msg.message}`;
                loading.classList.add("error");
            }
        };
        worker.onerror = (e) => {
            loadMsg.textContent = `Worker error: ${e.message}`;
            loading.classList.add("error");
        };
    }

    input.value = AI_PITCH;
    segButtons.find((b) => b.dataset.draft === "flagged")?.setAttribute("aria-pressed", "true");

    // iOS Safari OOM-kills the tab when onnxruntime instantiates the 145 MB model
    // (it works on desktop Safari, which has far more per-tab memory). So on iOS we
    // don't auto-load: show the manuscript with precomputed marks (read-only) plus an
    // explicit opt-in to try the live engine anyway.
    const IS_IOS =
        /iP(hone|od|ad)/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (IS_IOS) {
        host?.classList.add("bw-demo--static");
        const eyebrow = host?.querySelector(".bw-eyebrow");
        if (eyebrow) eyebrow.textContent = "Preview · desktop for live";
        // Precomputed lints exist only for the ai-style drafts, so the static
        // preview can't switch packs. "Run it live anyway" re-enables it.
        packSel.disabled = true;
        input.readOnly = true;
        loading.classList.add("done"); // hide the loader overlay so the marks show
        sentText = AI_PITCH;
        lastLints = AI_LINTS;
        paintBackdrop(AI_PITCH, AI_LINTS);
        renderRail(AI_LINTS);
        showStaticNotice(startLive);
    } else {
        paintBackdrop(AI_PITCH, []);
        startLive();
    }

    // A non-blocking banner above the manuscript, injected only on the static path.
    function showStaticNotice(onRun: () => void): void {
        if (!host || host.querySelector(".bw-note")) return;
        const note = document.createElement("div");
        note.className = "bw-note";
        note.innerHTML =
            `<span class="bw-note__txt"><strong>Desktop&#8209;only live demo.</strong> The in&#8209;browser parser is ~145&nbsp;MB — more than iOS&nbsp;Safari allows, so it crashes the tab here. Below is a captured run; edit it live on a desktop browser, or run <code>npx&nbsp;writinglint</code>.</span>` +
            `<button type="button" class="bw-note__run">Run it live anyway</button>`;
        const bar = host.querySelector(".bw-demo__bar");
        if (bar) bar.after(note);
        else host.prepend(note);
        note.querySelector<HTMLButtonElement>(".bw-note__run")?.addEventListener("click", () => {
            note.remove();
            onRun();
        });
    }
}
