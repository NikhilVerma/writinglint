"""Build WritingLint-compatible parsed-sentence records with UTF-16 offsets."""

from __future__ import annotations

from typing import TypedDict

from structures import Sentence


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


class ComparisonRecord(TypedDict):
    family: str
    text: str
    gold: ParsedSentence
    predicted: ParsedSentence


def _utf16_boundaries(text: str) -> list[int]:
    """Map every Python code-point boundary to a JavaScript UTF-16 index."""
    boundaries = [0]
    offset = 0
    for character in text:
        offset += len(character.encode("utf-16-le")) // 2
        boundaries.append(offset)
    return boundaries


def offsets(text: str, forms: list[str]) -> list[tuple[int, int]]:
    """Align token forms in order and return document-local UTF-16 spans."""
    result: list[tuple[int, int]] = []
    cursor = 0
    boundaries = _utf16_boundaries(text)
    for form in forms:
        start = text.find(form, cursor)
        if start < 0:
            raise ValueError(f"Could not align {form!r} after {cursor} in {text!r}")
        end = start + len(form)
        result.append((boundaries[start], boundaries[end]))
        cursor = end
    return result


def parsed(
    sentence: Sentence,
    heads: list[int],
    relations: list[str],
    upos: list[str],
) -> ParsedSentence:
    """Create one parsed-sentence payload after validating word-level alignment."""
    count = len(sentence.words)
    lengths = {count, len(sentence.lemmas), len(heads), len(relations), len(upos)}
    if len(lengths) != 1:
        raise ValueError(
            "Mismatched word-level fields: "
            f"words={count}, lemmas={len(sentence.lemmas)}, heads={len(heads)}, "
            f"relations={len(relations)}, upos={len(upos)}"
        )

    spans = offsets(sentence.text, sentence.words)
    return {
        "text": sentence.text,
        "start": 0,
        "end": _utf16_boundaries(sentence.text)[-1],
        "tokens": [
            {
                "id": index + 1,
                "form": form,
                "lemma": sentence.lemmas[index],
                "upos": upos[index],
                "head": heads[index],
                "deprel": relations[index],
                "start": spans[index][0],
                "end": spans[index][1],
            }
            for index, form in enumerate(sentence.words)
        ],
    }
