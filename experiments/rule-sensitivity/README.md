# Rule-sensitivity pilot

This pilot parses controlled sentence families once, applies single-factor
counterfactual interventions to heads, dependency relations, and UPOS tags, and
replays only the dependency-driven AI-style rules. An entry is emitted only
when the intervention changes at least one rule decision.

```bash
node --conditions=source --import tsx experiments/rule-sensitivity/pilot.ts
```

Outputs are written to:

- `out/seeds.jsonl`: every input sentence, including zero-coverage families;
- `out/pilot.jsonl`: interventions that changed a rule decision;
- `out/summary.json`: coverage, balance, and zero-sensitivity families.

The expanded pilot includes original rule templates, the user's paired notes,
and structural categories inspired by the MIT-licensed `stop-slop` project.
External examples are used as category inspiration; generated sentences are
new templates rather than copied reference examples.
