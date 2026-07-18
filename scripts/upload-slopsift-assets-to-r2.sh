#!/usr/bin/env bash
set -euo pipefail

BUCKET="${SLOPSIFT_R2_BUCKET:-slopsift-models}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL="$ROOT/packages/parser-node/model"
CLASSIFIER="$ROOT/packages/rulepack-ai-style/model/classifier.json"
ORT="$ROOT/node_modules/onnxruntime-web/dist"
MODEL_VERSION="compact-int8-v1"
ORT_VERSION="1.27.0"

put() { npm exec -w slopsift-web -- wrangler r2 object put "$BUCKET/$1" --file "$2" --remote; }

npm run setup-model

for file in manifest.json parser.onnx relations.onnx; do
  put "$MODEL_VERSION/$file" "$MODEL/$file"
done
for file in tokenizer.json tokenizer_config.json; do
  put "$MODEL_VERSION/tokenizer/$file" "$MODEL/tokenizer/$file"
done
put "$MODEL_VERSION/classifier.json" "$CLASSIFIER"
put "$MODEL_VERSION/MODEL_LICENSE.md" "$ROOT/packages/parser-node/MODEL_LICENSE.md"

for file in ort-wasm-simd-threaded.wasm ort-wasm-simd-threaded.mjs; do
  put "onnxruntime-web/$ORT_VERSION/$file" "$ORT/$file"
done

echo "Uploaded immutable demo assets to r2://$BUCKET"
