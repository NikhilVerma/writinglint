import assert from "node:assert/strict";
import { test, before } from "node:test";
import { Linter, resolveConfig, type Lint, type ResolvedConfig } from "writinglint-core";
import { loadParser } from "writinglint-parser-node";
import { recommended } from "../src/index.js";

let linter: Linter;
let config: ResolvedConfig;

before(async () => {
    linter = new Linter(await loadParser());
    config = resolveConfig(recommended);
});

async function lint(text: string): Promise<Lint[]> {
    return (await linter.lint(text, config)).lints;
}
const fired = (lints: Lint[], rule: string) => lints.some((l) => l.ruleId === `craft/${rule}`);

// Each canonical tell below is a real draft that earned its rule.

test("hedge-opener fires on modal + seem/sound with expletive it/this", async () => {
    assert.ok(
        fired(
            await lint("It might seem counterintuitive but we need better NLP tools."),
            "hedge-opener"
        )
    );
    assert.ok(fired(await lint("This could sound naive, but the plan works."), "hedge-opener"));
});

test("hedge-opener does NOT fire on plain reported perception", async () => {
    assert.ok(!fired(await lint("It seemed late when we arrived."), "hedge-opener"));
    assert.ok(!fired(await lint("The idea seems solid."), "hedge-opener"));
});

test("verdict-echo fires on the same evaluative word twice in a short doc", async () => {
    assert.ok(
        fired(await lint("It mandated better parsers to build better guardrails."), "verdict-echo")
    );
    assert.ok(
        fired(
            await lint("The parser is good and runs anywhere. It's not fast but it's good."),
            "verdict-echo"
        )
    );
});

test("verdict-echo does NOT fire on a single use", async () => {
    assert.ok(!fired(await lint("We need better NLP tools more than ever."), "verdict-echo"));
});

test("verdict-word fires on evidence-free verdict words", async () => {
    assert.ok(
        fired(
            await lint("This helps you fix issues in your model in an unbiased way."),
            "verdict-word"
        )
    );
    assert.ok(fired(await lint("The pipeline handles malformed input properly."), "verdict-word"));
});

test("parenthetical-hedge fires on a self-undercutting aside", async () => {
    assert.ok(
        fired(
            await lint("Give a slightly different prompt (not that important) to each model."),
            "parenthetical-hedge"
        )
    );
    assert.ok(
        !fired(
            await lint("The parser (a 145 MB ONNX model) runs in the browser."),
            "parenthetical-hedge"
        )
    );
});

test('qualifier-softener fires on advmod softeners, not attributive "pretty"', async () => {
    assert.ok(fired(await lint("The demo is pretty good."), "qualifier-softener"));
    assert.ok(
        !fired(await lint("She planted pretty flowers along the fence."), "qualifier-softener")
    );
});

test("apology-reflex fires on unprompted apology", async () => {
    assert.ok(
        fired(await lint("Sorry for the long post, but here is the idea."), "apology-reflex")
    );
});

test("hedge-phrase fires on bare hedges outside parentheses", async () => {
    assert.ok(fired(await lint("I think we need deterministic NLP tools."), "hedge-phrase"));
    assert.ok(fired(await lint("Honestly, the second approach is faster."), "hedge-phrase"));
    assert.ok(fired(await lint("Maybe the parser should reject that input."), "hedge-phrase"));
    assert.ok(fired(await lint("The API is sort of broken on retries."), "hedge-phrase"));
});

test("hedge-phrase does NOT fire on literal or mid-sentence epistemic uses", async () => {
    // "a kind of parser" — literal taxonomy, not a hedge on an adjective/verb.
    assert.ok(!fired(await lint("A dependency parser is a kind of parser."), "hedge-phrase"));
    // mid-sentence "probably" is a real probability claim, not a claim-opener.
    assert.ok(!fired(await lint("The job will probably finish before midnight."), "hedge-phrase"));
});

test("uniform-rhythm fires on metronome prose, nine same-length sentences", async () => {
    const drone = [
        "The team finished the report on Monday morning.",
        "The client approved the budget on Tuesday afternoon.",
        "The designers shipped the mockups on Wednesday evening.",
        "The engineers merged the feature on Thursday morning.",
        "The testers verified the release on Friday afternoon.",
        "The managers reviewed the metrics on Saturday morning.",
        "The founders discussed the roadmap on Sunday evening.",
        "The interns updated the documents on Monday afternoon.",
        "The vendors delivered the hardware on Tuesday morning."
    ].join(" ");
    assert.ok(fired(await lint(drone), "uniform-rhythm"));
});

test("uniform-rhythm does NOT fire on varied, breathing prose", async () => {
    const varied =
        "The report was late. Nobody minded, because the client had spent the whole week " +
        "arguing about a budget that everyone already knew would be approved in the end. " +
        "Design shipped early. The engineers, cautious after last quarter's outage and the " +
        "long postmortem that followed it, merged the feature behind a flag. Tests passed. " +
        "The founders talked all Sunday. By Monday morning the roadmap looked different, and " +
        "the interns quietly rewrote every document that mentioned the old plan. It worked.";
    assert.ok(!fired(await lint(varied), "uniform-rhythm"));
});
