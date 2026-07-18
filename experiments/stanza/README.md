# Stanza experiment

This is an isolated reference-parser experiment. It is not part of the shipped
WritingLint runtime.

```bash
cd experiments/stanza
uv sync
uv run python parse.py --download
uv run python parse.py
uv run python parse.py "Trust the flags, not the number."
echo "Experts argue that this works." | uv run python parse.py
```

Models are stored in `experiments/stanza/.models`.

## Initial results

Tested on Apple Silicon with Python 3.12, Stanza 1.14, and CPU inference:

- Python environment: approximately 587 MB, mostly PyTorch.
- English model files: approximately 322 MB.
- Pipeline load: approximately 3.6 seconds.
- Five-sentence probe: approximately 0.32 seconds after loading.
- Repeated five-sentence probe: approximately 0.32 seconds.

The reference parse matched the dependency shapes expected by the current
flagship rules:

- `number` is a `conj` dependent of `flags` in “Trust the flags, not the
  number.”
- `testament` is an `obl` dependent of `serves`, with `as` attached as `case`.
- `improve` is a `ccomp` dependent of `argue`, with `Experts` as `nsubj`.
- `showcasing` is an `advcl` dependent of `simplifies`.
- `vibrant` and `diverse` are `conj` dependents in the adjective series.

Stanza also supplies document-global Python character offsets through
`start_char` and `end_char`. These are Unicode code-point offsets, not
JavaScript UTF-16 indices; astral characters such as emoji still require an
explicit conversion at the TypeScript boundary.

The default English pipeline is too large to ship directly in the browser, but
it is immediately useful as:

- an independent development oracle;
- a temporary local/server adapter;
- a source of expected UD output for parser and rule regression tests.
