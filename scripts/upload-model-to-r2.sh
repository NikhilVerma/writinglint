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
MODEL="$ROOT/models/rule-family-50-onnx-int8"
CLF="$ROOT/packages/rulepack-ai-style/model/classifier.json"
ORT="$ROOT/node_modules/onnxruntime-web/dist"

put() { npx wrangler r2 object put "$BUCKET/$1" --file "$2" --remote; }

[ -f "$MODEL/parser.onnx" ] || { echo "Missing $MODEL"; exit 1; }

echo "→ compact INT8 parser (compact-int8/)"
for f in parser.onnx relations.onnx manifest.json; do
  put "compact-int8/$f" "$MODEL/$f"
done
for f in tokenizer.json tokenizer_config.json; do
  put "compact-int8/tokenizer/$f" "$MODEL/tokenizer/$f"
done

echo "→ stylometric classifier (compact-int8/classifier.json)"
put "compact-int8/classifier.json" "$CLF"

echo "→ onnxruntime-web runtime (ort/)"
for f in ort-wasm-simd-threaded.wasm ort-wasm-simd-threaded.mjs; do
  put "ort/$f" "$ORT/$f"
done

echo "Done. Uploaded parser + runtime to r2://$BUCKET"
