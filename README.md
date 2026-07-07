# Better Write

**A dependency-parse–driven detector that shows you where your writing rings hollow.**

AI prose is convincingly fluent but often *hollow* — grand-sounding constructions
with nothing inside. Better Write finds those constructions in the **dependency
graph** of your text (not by matching words), scores how AI-shaped the writing is
with a stylometric classifier, and highlights each hollow spot with a concrete
fix. It's built to help you *write better*, not to accuse.

Two layers:

1. **Detection score (SOTA-for-POS+graph)** — a stylometric classifier over
   dependency-relation n-grams + POS n-grams + interpretable style features →
   *how AI-shaped is this?*
2. **Actionable highlights** — interpretable rules that match hollow
   *constructions* in the parse and suggest how to add substance.

The taxonomy of tells comes from Wikipedia's
[**Signs of AI writing**](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing);
the engine is [`nlpgraph`](https://www.npmjs.com/package/nlpgraph)'s offline
dependency parser.

## The insight: match constructions, not words

Most "AI detectors" match keyword lists, which any paraphrase defeats. Better
Write matches the **syntactic shape** in the dependency graph, so *any* words
fill the slots:

| Wikipedia sign (a "hollow" construction) | dependency signature — word-agnostic |
|---|---|
| **Copula avoidance** ("X stands as a testament…") | non-`be` root verb + `obl` noun with `case`="as" |
| **Vague attribution** ("Experts argue that…") | bare (no-`det`) common-noun `nsubj` + saying-verb + `ccomp` |
| **Participial appendage** ("…, showcasing its value") | trailing `advcl` gerund after the main clause |
| **Negative parallelism** ("not only X but also Y") | `conj` with `cc`="but" + "only/also" markers |
| **Rule of three** ("bustling, vibrant, and diverse") | ADJ/ADV head with ≥2 `conj` children |
| **Light-verb inflation** ("plays a pivotal role") | play/occupy + `obj`=role + `amod` adjective |

Where a slot is irreducibly *semantic* (a parser can't tell an *importance*
adjective from any adjective), a **small closed seed** narrows it — but the
structure always comes from the parse. And a few signs are inherently
lexical/character-level (the "AI vocabulary" word list; em-dash / curly-quote /
emoji formatting) — those stay lists *by nature*, and are labelled as such.

## The detector (SOTA with POS + graph)

We don't reinvent the method — we follow the literature and extend it:

- **Base — [DependencyAI](https://arxiv.org/abs/2602.15514)** (dependency-relation
  n-gram TF-IDF → gradient-boosted classifier, ~89% F1 on public benchmarks).
- **Extensions:** + POS (UPOS) n-grams; + interpretable **stylometric scalars**
  (burstiness, type-token ratio, copula ratio, POS/deprel ratios, mean
  dependency distance, tree depth…); + our **hollowness-rule rates**. The last
  set is what also makes the score *explainable and fixable*.
- **Model:** an L2-regularised logistic regression (deterministic, calibrated
  probability). It serialises to a **data-free** JSON file (`models/classifier.json`,
  vocabulary + weights only), so the model ships open-source while the training
  data stays closed.

True SOTA overall is neural/perplexity-based (fine-tuned DeBERTa; Binoculars),
but that needs an LLM at runtime and generalises poorly under adversarial
paraphrase. This is the strongest *offline, deterministic, no-LLM* detector we
can build.

```
src/detector/
  graph.ts        dependency-graph helpers + doc-global byte→char offsets
  structural.ts   Wikipedia constructions as dependency-shape rules
  rules.ts        the inherently-lexical signs (AI vocab, formatting, idioms)
  features.ts     deprel/POS n-grams + stylometric + hollowness features
  classifier.ts   TF-IDF vectoriser + logistic regression (train / predict)
  analyze.ts      orchestration: parse → rules → findings + classifier score
```

## Evaluation

Measured with a **maker≠checker** discipline (`eval/`), and with the two rules
this project learned the hard way:

1. **We never author the data.** The tool is an AI; any text *it* writes is AI
   text. Early on, 3 maintainer-written "human-voice" samples poisoned the human
   class — the classifier correctly flagged them, which is *how we found the
   bug*. Human data must be **real, fetched** writing; AI data must be **real
   model output**, not our confabulation.
2. **Don't trust a number from one distribution.** An early model scored
   **AUC 0.997** on same-distribution held-out — then **0.65** on more varied
   data. It hadn't learned "AI vs human"; it had learned *one narrow stylistic
   slice vs everything else* and flagged out-of-slice human writing as AI. The
   honest fix was a **diverse** training pool, not a better model.

The training pool spans **real human** writing across many authors and eras and
**real AI** output from many model families; a stratified blind slice is held out
and never trained on. (Sources and composition are documented privately with the
closed dataset.)

| eval | ROC-AUC | F1 | precision | recall | specificity |
|---|---|---|---|---|---|
| 5-fold CV (diverse pool) | 0.879 | 0.834 | 0.813 | 0.856 | 0.799 |
| **blind test** (held-out slice) | **0.899** | 0.833 | 0.786 | 0.887 | 0.754 |
| OOD probe (out-of-distribution) | 0.923 | 0.811 | 0.789 | 0.833 | 0.778 |

**AUC ~0.90 that holds across CV, a blind slice, *and* out-of-distribution** — a
real detector, comparable to DependencyAI's 0.889 F1 on a comparable multi-model
task. The classifier lifts subtle-AI recall from **33% (rules alone) → ~89%**.

**Honest limitations.** (a) Specificity ~0.75 is the weak spot — clean *modern*
human prose still trips it; needs richer human diversity + precision tuning.
(b) Cross-source generalisation (train one domain / test another) is untested.
(c) Highlight offsets are exact (nlpgraph 0.3.0 doc-global byte ranges).

```bash
npm run download-model   # fetch the xsmall ONNX parser (~145 MB, once)
npm run train            # fit + GUARDED honest eval (CV + blind slice + OOD)
npm run eval             # interpretable diagnostic view (firing / FP triage)
npm test                 # detector unit tests
```

> **⚠ Eval data is CLOSED-SOURCE / private.** It contains third-party text, so
> `eval/data/` is **gitignored** and never enters this repo. The
> code, the trained model (`models/classifier.json` — data-free), and the metrics
> are open source; only the corpus is private, and its sources are documented
> privately alongside it. `npm run train` / `npm run eval` degrade gracefully with
> a pointer if the data isn't present.

## Web app

A Hemingway-style editor that highlights hollow constructions as you type —
**runs entirely in your browser**, no server, nothing uploaded. The dependency
parser (~145 MB, one-time) and the classifier load on-device (onnxruntime-web on
WASM + a transformers.js tokenizer, following nlpgraph's browser conventions).

```bash
npm run download-model   # once — vendors the ONNX parser into ./models
npm run train            # once — produces models/classifier.json
npm run dev              # stages assets, bundles (esbuild), serves localhost:5173
# or a production bundle:
npm run copy-runtime && npm run build:client   # → public/ (static, self-hostable)
```

```
src/web/
  parser-browser.ts   loads parser + tokenizer + classifier from our own origin
  main.ts             editor UI: debounced parse, highlights, score ring, legend
build-client.mjs      esbuild bundle → public/app.js
copy-runtime.mjs      stage /model (parser + classifier) + /ort (WASM) into public/
dev.mjs               watch + serve
```

## CLI

```bash
npm run cli -- essay.txt          # highlighted output + score + categories
cat essay.txt | npm run cli
```

## Roadmap

1. ✅ Dependency-graph detector (constructions, not word lists).
2. ✅ SOTA-for-POS+graph stylometric classifier (DependencyAI + extensions), eval'd.
3. ✅ External validity — trained + evaluated on real, diverse, multi-model data.
4. ✅ Browser app — Hemingway-style editor (esbuild + onnxruntime-web, on-device).
5. **Lift specificity** on modern human prose (richer human diversity, precision tuning).
6. Cross-source eval (train-one-dataset / test-another); per-finding rewrite suggestions.

## Credits

- Detection taxonomy: Wikipedia, *[Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)* (CC BY-SA).
- Dependency parser: [`nlpgraph`](https://www.npmjs.com/package/nlpgraph) (MIT).
- Method: [DependencyAI](https://arxiv.org/abs/2602.15514); AI-text-detection [survey](https://www.sciencedirect.com/science/article/abs/pii/S1574013725000693).
- Inspiration: [Hemingway Editor](https://hemingwayapp.com/).

## License

MIT (code + model). Eval data is not distributed.
