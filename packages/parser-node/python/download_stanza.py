"""Download only the Stanza processors used by WritingLint."""

from __future__ import annotations

import argparse
from pathlib import Path

import stanza


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, required=True)
    args = parser.parse_args()
    stanza.download(
        "en",
        model_dir=str(args.model_dir),
        processors="tokenize,pos,lemma,depparse",
    )


if __name__ == "__main__":
    main()
