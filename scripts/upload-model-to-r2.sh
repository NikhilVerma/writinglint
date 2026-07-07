#!/usr/bin/env bash
#
# Upload the parser model + ONNX runtime to the R2 bucket the demo streams from.
# Run once at setup, and again whenever the parser or classifier.json changes.
#
# Prereqs:
#   - `npx wrangler login` (or CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID set)
#   - the parser downloaded locally: `npm run download-model`
#   - the bucket created:  `npx wrangler r2 bucket create writinglint-models`
#
# These files are gitignored and never committed; R2 is where prod gets them.
set -euo pipefail

BUCKET="writinglint-models"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
XS="$ROOT/models/xsmall"
CLF="$ROOT/packages/rulepack-ai-style/model/classifier.json"
ORT="$ROOT/node_modules/onnxruntime-web/dist"

put() { npx wrangler r2 object put "$BUCKET/$1" --file "$2" --remote; }

[ -f "$XS/model.fp16.onnx" ] || { echo "Missing $XS — run: npm run download-model"; exit 1; }

echo "→ parser model (xsmall/)"
for f in config.json tokenizer.json tokenizer_config.json vocabs.json model.fp16.onnx; do
  put "xsmall/$f" "$XS/$f"
done

echo "→ stylometric classifier (xsmall/classifier.json)"
put "xsmall/classifier.json" "$CLF"

echo "→ onnxruntime-web runtime (ort/)"
for f in "$ORT"/*.wasm "$ORT"/*.mjs; do
  put "ort/$(basename "$f")" "$f"
done

echo "Done. Uploaded parser + runtime to r2://$BUCKET"
