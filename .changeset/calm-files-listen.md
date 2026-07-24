---
"writinglint-parser-node": patch
"slopsift": patch
---

Prevent overlength prose blocks and Markdown tables from aborting a lint run by
adding table boundaries, defensive parser chunking, and structured per-file
runtime diagnostics.

Extract visible Astro copy and static page metadata, lint substantial multiline
prose templates in JavaScript and TypeScript, and report explicitly selected
files that contain no extractable prose.
