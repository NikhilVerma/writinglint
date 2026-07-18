# writinglint

Command line for [WritingLint](https://github.com/NikhilVerma/writinglint) — lint
prose and score how AI-shaped it reads.

The published CLI includes the compact INT8 parser and works offline. In a
source checkout, stage that same verified model before running it:

```bash
npm install
npm run setup-model
npm run cli -- lint README.md
```

The focused `sloplint` product is a separate consumer package under
`packages/sloplint`; it is not a mode of this CLI.
