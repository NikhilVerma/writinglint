# WritingLint — Node example

Installs the published `writinglint-*` packages from npm and lints text with the
library API. Outside the repo workspace on purpose, so it exercises the real
published artifacts.

```bash
npm install                                    # writinglint-* from npm
# configure STANZA_MODEL_DIR and WRITINGLINT_PYTHON for the current backend
npm start -- "Choose clarity, not cleverness." # lint some text
```
