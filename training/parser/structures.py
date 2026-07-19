"""Shared, dependency-free data structures for parser training and evaluation."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Sentence:
    """One syntactic sentence and the source metadata needed by evaluators."""

    text: str
    family: str
    words: list[str]
    lemmas: list[str]
    upos: list[str]
    heads: list[int]
    relations: list[str]
    rule_weights: list[float]
