# Sloplint website

The standalone product site for Sloplint. It is intentionally separate from the
WritingLint documentation site and has its own copy, interface, deployment, and
release lifecycle.

The live demo uses the same owned INT8 dependency parser and AI-style rulepack as
the CLI. Parsing happens in a Web Worker and text never leaves the browser.

## Local development

The compact model must exist at `models/rule-family-50-onnx-int8`. See
[`../sloplint/MODEL.md`](../sloplint/MODEL.md) for the training and export path.

```sh
npm run dev -w sloplint-web
```

## Production build

```sh
npm run build -w sloplint-web
```

This creates a static deployment in `dist/`, including the parser, tokenizer,
ONNX Runtime Web files, and browser bundles. The deployed site needs cross-origin
isolation only if multi-threaded WASM is enabled in the future; the current demo
uses one WASM thread.

Set `PUBLIC_SITE_URL` at build time if the canonical production domain is not
`https://sloplint.dev`.

## Cloudflare Workers Static Assets

```sh
npx wrangler deploy --config packages/sloplint-web/wrangler.toml
```

Model files are copied into the static build for a self-contained first deploy.
They can move to the existing R2 model bucket later without changing the demo
protocol.
