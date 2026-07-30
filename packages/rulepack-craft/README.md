# writinglint-rulepack-craft

**Better-writing rules** (formerly `writinglint-rulepack-conviction`). A rulepack for
[WritingLint](https://github.com/NikhilVerma/writinglint) that catches the
science of bad writing — first the tells of a writer who doesn't quite believe
they're allowed to say the thing, then the music of the prose itself:

| Rule | Catches | Default |
|---|---|---|
| `hedge-opener` | "It might seem counterintuitive, but …" — apologising for the claim before making it | error |
| `verdict-echo` | "better parsers to build better guardrails" — the same evaluative word spent twice | error |
| `verdict-word` | "unbiased", "properly", "robust" — a conclusion with the evidence missing | warn |
| `parenthetical-hedge` | "(not that important)" — a sentence undercut from inside a parenthesis | error |
| `qualifier-softener` | "pretty good" — a dimmer switch on your own claim | warn |
| `apology-reflex` | "sorry for the long post" — apologising to a reader who hasn't objected | error |
| `stacked-nouns` | "customer onboarding flow migration project timeline" — a noun pile the reader must unpack | warn |
| `nominalization` | "made a decision" — a light verb burying the real verb ("decided") | warn |
| `uniform-rhythm` | metronome prose — every sentence near the same length (Gary Provost: "vary the sentence length, and I create music") | warn |

The structural rules (`hedge-opener`, `qualifier-softener`, `stacked-nouns`, `nominalization`) match on the
dependency graph, so any words can fill the construction's slots: "This could
sound naive …" fires; "It seemed late" and "pretty flowers" don't.

Every rule here was earned by a real draft. The messages don't just name the
problem — they say what to do instead, because the fix is always one of two
moves: **lead with the claim**, or **replace the verdict with the event that
produced it** ("like what?").

## Use

```ts
import { defineConfig } from 'writinglint-core';
import { recommended } from 'writinglint-rulepack-craft';

export default defineConfig({
  extends: [recommended],
  // rules: { 'craft/verdict-word': 'error' },   // promote / demote / disable
});
```

Or layer it with the ai-style pack — they flag different failure modes
(models overclaim; people underclaim) and compose cleanly.

## License

MIT.
