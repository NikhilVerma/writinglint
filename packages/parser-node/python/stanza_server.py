"""Persistent JSON-lines bridge from Node to Stanza.

Protocol:
  stdin  {"id": 1, "text": "..."}\n
  stdout {"id": 1, "sentences": [...]}\n

All output offsets are document-global UTF-16 indices for direct use by JS.
Diagnostics go to stderr so stdout remains machine-readable.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import TypedDict

import stanza


RequestId = int | None


class ParsedToken(TypedDict):
    id: int
    form: str
    lemma: str
    upos: str
    head: int
    deprel: str
    start: int
    end: int


class ParsedSentence(TypedDict):
    text: str
    start: int
    end: int
    tokens: list[ParsedToken]


def utf16_index(text: str, codepoint_index: int) -> int:
    return len(text[:codepoint_index].encode("utf-16-le")) // 2


def load_pipeline(model_dir: Path) -> stanza.Pipeline:
    return stanza.Pipeline(
        "en",
        model_dir=str(model_dir),
        processors="tokenize,pos,lemma,depparse",
        use_gpu=False,
        download_method=None,
        verbose=False,
    )


def parse_document(nlp: stanza.Pipeline, text: str) -> list[ParsedSentence]:
    document = nlp(text)
    sentences: list[ParsedSentence] = []

    for sentence in document.sentences:
        words: list[ParsedToken] = []
        for token in sentence.tokens:
            for word in token.words:
                # Stanza exposes exact sub-token offsets for contractions on Word.
                start_char = word.start_char
                end_char = word.end_char
                if start_char is None or end_char is None:
                    raise ValueError(f"Stanza omitted offsets for {word.text!r}")
                if not isinstance(word.id, int) or not isinstance(word.head, int):
                    raise TypeError(
                        f"Stanza returned a non-integer dependency id for {word.text!r}"
                    )
                words.append(
                    {
                        "id": word.id,
                        "form": word.text,
                        "lemma": word.lemma or word.text.lower(),
                        "upos": word.upos or "X",
                        "head": word.head,
                        "deprel": word.deprel or "dep",
                        "start": utf16_index(text, start_char),
                        "end": utf16_index(text, end_char),
                    }
                )

        if words:
            start = min(word["start"] for word in words)
            end = max(word["end"] for word in words)
        else:
            start = end = 0

        sentences.append(
            {
                "text": sentence.text,
                "start": start,
                "end": end,
                "tokens": words,
            }
        )

    return sentences


def send(payload: object) -> None:
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, required=True)
    args = parser.parse_args()

    try:
        nlp = load_pipeline(args.model_dir)
    except Exception as error:
        print(f"Failed to load Stanza: {error}", file=sys.stderr, flush=True)
        raise

    send({"ready": True})
    for line in sys.stdin:
        request: object = None
        request_id: RequestId = None
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise TypeError("request must be a JSON object")
            raw_id = request.get("id")
            if not isinstance(raw_id, int) or isinstance(raw_id, bool):
                raise TypeError("id must be an integer")
            request_id = raw_id
            text = request.get("text")
            if not isinstance(text, str):
                raise TypeError("text must be a string")
            send({"id": request_id, "sentences": parse_document(nlp, text)})
        except Exception as error:
            send({"id": request_id, "error": f"{type(error).__name__}: {error}"})


if __name__ == "__main__":
    main()
