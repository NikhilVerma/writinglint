# writinglint

Development preview of the general-purpose
[WritingLint](https://github.com/NikhilVerma/writinglint) command line. The
unscoped `writinglint` npm package has not been published yet.

In a source checkout, stage the verified compact INT8 parser before running it:

```bash
npm install
npm run setup-model
npm run cli -- lint README.md
```

The focused `slopsift` product is a separate consumer package under
`packages/slopsift`; it is not a mode of this CLI.
