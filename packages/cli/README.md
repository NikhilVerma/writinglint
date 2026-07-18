# writinglint

Command line for [WritingLint](https://github.com/NikhilVerma/writinglint) — lint
prose and score how AI-shaped it reads.

The current development build uses the repository's isolated Stanza backend:

```bash
npm install
npm run setup-stanza
npm run cli -- lint README.md
```

The focused `sloplint` product is a separate consumer package under
`packages/sloplint`; it is not a mode of this CLI.
