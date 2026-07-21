# SlopSift website

The standalone product site for SlopSift. It is intentionally separate from the
WritingLint documentation site and has its own copy, interface, deployment, and
release lifecycle.

The live demo and `/editor/` use the same owned INT8 dependency parser and
AI-style rulepack as the CLI. Parsing happens in a Web Worker and text never
leaves the browser.

The editor keeps Markdown as source text. CodeMirror applies semantic styling
to headings, emphasis, links, quotes, and code without rewriting the file. The
CLI's browser-safe extraction entry point masks frontmatter, code, link targets,
image metadata, and block quotations before linting while retaining source
offsets for diagnostics. Plain-text mode sends the full draft to the linter.

Draft recovery uses browser-local storage. Opening a file reads it through the
browser file picker, and downloading creates a local Markdown or text file. The
site has no draft upload endpoint.

## Local development

The development command stages the same compact model shipped in
`writinglint-parser-node`. See [`../slopsift/MODEL.md`](../slopsift/MODEL.md)
for the training and export path.

```sh
npm run dev -w slopsift-web
```

## Production build

```sh
npm run build -w slopsift-web
```

This creates the site and browser bundles in `dist/`. Production model and ONNX
Runtime requests stay same-origin through the SlopSift Worker and are streamed
from R2. The deployed site needs cross-origin isolation only if multi-threaded
WASM is enabled in the future; the current demo uses one WASM thread.

Set `PUBLIC_SITE_URL` at build time if the canonical production domain is not
`https://slopsift.dev`.

## Cloudflare Worker and R2

```sh
npm run r2:create -w slopsift-web
bash scripts/upload-slopsift-assets-to-r2.sh
npm run deploy -w slopsift-web
```

Wrangler attaches `slopsift.dev`, `www.slopsift.dev`, and
`models.slopsift.dev` as Worker custom domains. The old `sloplint.dev` hosts
remain attached only to issue path-preserving permanent redirects to the new
canonical hosts. The product demo reads same-origin `/model/*` and `/ort/*` paths;
source packaging can read immutable `/compact-int8-v1/*` paths from the model
subdomain. Released object prefixes are immutable.

`assets.run_worker_first` is intentionally enabled: Cloudflare otherwise serves
matching static files before Worker code, which would bypass redirects on legacy
URLs such as `/` and `/privacy/`.

## Deploy every push with Workers Builds

Use Cloudflare's native Git integration, not GitHub Actions. Connect the
existing Worker to the `NikhilVerma/writinglint` repository under
**Settings → Builds** with these values:

- Production branch: `main`
- Root directory: `/packages/slopsift-web`
- Build command: `cd ../.. && npm ci && npm run build -w slopsift-web`
- Deploy command: `cd ../.. && npm run deploy -w slopsift-web`
- Build variable: `SKIP_DEPENDENCY_INSTALL=1`
- Non-production branch builds: disabled initially

The Worker retains its original internal deployment name so the existing Git
connection keeps working; that name is not public branding. The subdirectory
root points Workers Builds at this site's configuration. The
explicit build command installs from the monorepo root lockfile, builds only the
SlopSift site, then deploys its static assets, R2 binding, and custom domains on
every push to `main`.
