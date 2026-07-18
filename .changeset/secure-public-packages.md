---
"writinglint-core": patch
"writinglint-parser-node": patch
"writinglint-rulepack-ai-style": patch
"writinglint-rulepack-craft": patch
"writinglint": patch
"sloplint": minor
---

Ship complete license and source metadata and make CLI versions follow their
package manifests. Sloplint now verifies the
pinned model manifest and every downloaded ONNX/tokenizer artifact by byte count
and SHA-256 before loading it.
