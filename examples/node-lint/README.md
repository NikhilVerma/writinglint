# WritingLint — Node example

Installs the published `writinglint-*` packages from npm and lints text with the
library API. Outside the repo workspace on purpose, so it exercises the real
published artifacts.

```bash
npm install                                    # writinglint-* from npm
npm run setup                                  # download the parser model (~145 MB, once)
npm start -- "Choose clarity, not cleverness." # lint some text
```
