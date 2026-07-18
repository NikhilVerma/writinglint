# Sloplint website

The standalone product site for Sloplint. It is intentionally separate from the
WritingLint documentation site and has its own copy, interface, deployment, and
release lifecycle.

The live demo uses the same owned INT8 dependency parser and AI-style rulepack as
the CLI. Parsing happens in a Web Worker and text never leaves the browser.

## Local development

The development command stages the same compact model shipped in
`writinglint-parser-node`. See [`../sloplint/MODEL.md`](../sloplint/MODEL.md)
for the training and export path.

```sh
npm run dev -w sloplint-web
```

## Production build

```sh
npm run build -w sloplint-web
```

This creates the site and browser bundles in `dist/`. Production model and ONNX
Runtime requests stay same-origin through the Sloplint Worker and are streamed
from R2. The deployed site needs cross-origin isolation only if multi-threaded
WASM is enabled in the future; the current demo uses one WASM thread.

Set `PUBLIC_SITE_URL` at build time if the canonical production domain is not
`https://sloplint.dev`.

## Cloudflare Worker and R2

```sh
npm run r2:create -w sloplint-web
bash scripts/upload-sloplint-assets-to-r2.sh
npm run deploy -w sloplint-web
```

Wrangler attaches both `sloplint.dev` and `models.sloplint.dev` as Worker custom
domains. The product demo reads same-origin `/model/*` and `/ort/*` paths;
source packaging can read immutable `/compact-int8-v1/*` paths from the model
subdomain. Released object prefixes are immutable.

## Deploy every push with Workers Builds

Use Cloudflare's native Git integration, not GitHub Actions. Connect the
existing `sloplint` Worker to the `NikhilVerma/writinglint` repository under
**Settings → Builds** with these values:

- Production branch: `main`
- Root directory: `/packages/sloplint-web`
- Build command: `cd ../.. && npm ci && npm run build -w sloplint-web`
- Deploy command: `cd ../.. && npm run deploy -w sloplint-web`
- Build variable: `SKIP_DEPENDENCY_INSTALL=1`
- Non-production branch builds: disabled initially

The subdirectory root lets Workers Builds find the correct `name = "sloplint"`
configuration instead of the repository's separate WritingLint Worker. The
explicit build command installs from the monorepo root lockfile, builds only the
Sloplint site, then deploys its static assets, R2 binding, and custom domains on
every push to `main`.
