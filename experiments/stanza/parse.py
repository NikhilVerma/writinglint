"""Print Stanza's UD analysis in a compact, WritingLint-friendly format."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import stanza


DEFAULT_TEXT = """\
Trust the flags, not the number.
The platform serves as a testament to our commitment.
Experts argue that the change will improve reliability.
The release simplifies deployment, showcasing its value.
The interface is bustling, vibrant, and diverse.
"""


def download_models(model_dir: Path) -> None:
    stanza.download(
        "en",
        model_dir=str(model_dir),
        processors="tokenize,pos,lemma,depparse",
    )


def pipeline(model_dir: Path) -> stanza.Pipeline:
    return stanza.Pipeline(
        "en",
        model_dir=str(model_dir),
        processors="tokenize,pos,lemma,depparse",
        use_gpu=False,
        download_method=None,
        verbose=False,
    )


def print_analysis(text: str, model_dir: Path) -> None:
    doc = pipeline(model_dir)(text)
    for sentence_number, sentence in enumerate(doc.sentences, start=1):
        print(f"\nSentence {sentence_number}: {sentence.text}")
        print("ID\tTEXT\tUPOS\tHEAD\tDEPREL\tSTART:END")
        for word in sentence.words:
            token = next(token for token in sentence.tokens if word in token.words)
            if token.start_char is None or token.end_char is None:
                raise ValueError(f"Stanza omitted offsets for {word.text!r}")
            print(
                f"{word.id}\t{word.text}\t{word.upos}\t{word.head}\t"
                f"{word.deprel}\t{token.start_char}:{token.end_char}"
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=Path(__file__).parent / ".models",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Download the English tokenize/POS/lemma/dependency models.",
    )
    parser.add_argument(
        "text",
        nargs="?",
        help="Text to parse. Reads stdin when piped; otherwise uses examples.",
    )
    args = parser.parse_args()

    if args.download:
        download_models(args.model_dir)
        return

    text = args.text
    if text is None and not sys.stdin.isatty():
        text = sys.stdin.read()
    print_analysis(text or DEFAULT_TEXT, args.model_dir)


if __name__ == "__main__":
    main()
