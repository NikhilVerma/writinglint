"""CoNLL-U loading and word/subword alignment for compact parser training."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import torch
from conllu import parse_incr
from torch.utils.data import Dataset
from transformers import PreTrainedTokenizerBase

from structures import Sentence

UPOS = [
    "ADJ",
    "ADP",
    "ADV",
    "AUX",
    "CCONJ",
    "DET",
    "INTJ",
    "NOUN",
    "NUM",
    "PART",
    "PRON",
    "PROPN",
    "PUNCT",
    "SCONJ",
    "SYM",
    "VERB",
    "X",
]
UPOS_TO_ID = {label: index for index, label in enumerate(UPOS)}


def read_conllu(path: Path) -> Iterator[Sentence]:
    with path.open(encoding="utf-8") as source:
        for tokens in parse_incr(source):
            # Skip CoNLL-U range ids and empty nodes; syntactic words have int ids.
            words = [token for token in tokens if isinstance(token["id"], int)]
            if not words:
                continue
            text = str(
                tokens.metadata.get("text") or " ".join(str(token["form"]) for token in words)
            )
            yield Sentence(
                text=text,
                family=str(tokens.metadata.get("family") or "unknown"),
                words=[str(token["form"]) for token in words],
                lemmas=[str(token.get("lemma") or token["form"]).lower() for token in words],
                upos=[str(token["upos"]) for token in words],
                heads=[int(token["head"]) for token in words],
                relations=[str(token["deprel"]) for token in words],
                rule_weights=[
                    float((token.get("misc") or {}).get("RuleWeight", 1.0)) for token in words
                ],
            )


def relation_vocabulary(paths: list[Path]) -> list[str]:
    labels = {
        relation
        for path in paths
        for sentence in read_conllu(path)
        for relation in sentence.relations
    }
    return sorted(labels)


class DependencyDataset(Dataset[dict[str, torch.Tensor]]):
    def __init__(
        self,
        path: Path,
        tokenizer: PreTrainedTokenizerBase,
        relation_to_id: dict[str, int],
        max_subwords: int,
    ) -> None:
        if max_subwords <= 0:
            raise ValueError("max_subwords must be greater than zero")
        self.tokenizer = tokenizer
        self.relation_to_id = relation_to_id
        self.max_subwords = max_subwords
        self.sentences: list[Sentence] = []
        skipped = 0
        for sentence in read_conllu(path):
            unknown = sorted(set(sentence.relations) - relation_to_id.keys())
            if unknown:
                raise ValueError(
                    f"{path.name} contains dependency relations absent from the training vocabulary: {unknown}"
                )
            encoded = tokenizer(sentence.words, is_split_into_words=True, add_special_tokens=True)
            if len(encoded["input_ids"]) <= max_subwords:
                self.sentences.append(sentence)
            else:
                skipped += 1
        if skipped:
            print(f"Skipped {skipped} sentences over {max_subwords} subwords from {path.name}")
        self.skipped_sentences = skipped

    def __len__(self) -> int:
        return len(self.sentences)

    def __getitem__(self, index: int) -> dict[str, torch.Tensor]:
        sentence = self.sentences[index]
        encoded = self.tokenizer(
            sentence.words,
            is_split_into_words=True,
            truncation=False,
            max_length=self.max_subwords,
            add_special_tokens=True,
        )
        word_ids = encoded.word_ids()
        first_subword: list[int] = []
        previous: int | None = None
        for subword_index, word_id in enumerate(word_ids):
            if word_id is not None and word_id != previous:
                first_subword.append(subword_index)
            previous = word_id

        kept = len(first_subword)
        return {
            "input_ids": torch.tensor(encoded["input_ids"], dtype=torch.long),
            "attention_mask": torch.tensor(encoded["attention_mask"], dtype=torch.long),
            "word_starts": torch.tensor(first_subword, dtype=torch.long),
            "upos": torch.tensor(
                [UPOS_TO_ID[tag] for tag in sentence.upos[:kept]], dtype=torch.long
            ),
            "heads": torch.tensor(sentence.heads[:kept], dtype=torch.long),
            "relations": torch.tensor(
                [self.relation_to_id[relation] for relation in sentence.relations[:kept]],
                dtype=torch.long,
            ),
            "rule_weights": torch.tensor(sentence.rule_weights[:kept], dtype=torch.float),
        }


class PairedDependencyDataset(Dataset[dict[str, dict[str, torch.Tensor]]]):
    """The same word-level sentence encoded with student and teacher tokenizers."""

    def __init__(
        self,
        path: Path,
        student_tokenizer: PreTrainedTokenizerBase,
        teacher_tokenizer: PreTrainedTokenizerBase,
        relation_to_id: dict[str, int],
        max_subwords: int,
    ) -> None:
        if max_subwords <= 0:
            raise ValueError("max_subwords must be greater than zero")
        self.student_tokenizer = student_tokenizer
        self.teacher_tokenizer = teacher_tokenizer
        self.relation_to_id = relation_to_id
        self.max_subwords = max_subwords
        self.sentences: list[Sentence] = []
        skipped = 0
        for sentence in read_conllu(path):
            unknown = sorted(set(sentence.relations) - relation_to_id.keys())
            if unknown:
                raise ValueError(
                    f"{path.name} contains dependency relations absent from the teacher vocabulary: {unknown}"
                )
            student = student_tokenizer(
                sentence.words, is_split_into_words=True, add_special_tokens=True
            )
            teacher = teacher_tokenizer(
                sentence.words, is_split_into_words=True, add_special_tokens=True
            )
            if max(len(student["input_ids"]), len(teacher["input_ids"])) <= max_subwords:
                self.sentences.append(sentence)
            else:
                skipped += 1
        if skipped:
            print(
                f"Skipped {skipped} paired sentences over {max_subwords} subwords from {path.name}"
            )
        self.skipped_sentences = skipped

    def __len__(self) -> int:
        return len(self.sentences)

    def _encode(
        self, sentence: Sentence, tokenizer: PreTrainedTokenizerBase
    ) -> dict[str, torch.Tensor]:
        encoded = tokenizer(sentence.words, is_split_into_words=True, add_special_tokens=True)
        first_subword: list[int] = []
        previous: int | None = None
        for subword_index, word_id in enumerate(encoded.word_ids()):
            if word_id is not None and word_id != previous:
                first_subword.append(subword_index)
            previous = word_id
        return {
            "input_ids": torch.tensor(encoded["input_ids"], dtype=torch.long),
            "attention_mask": torch.tensor(encoded["attention_mask"], dtype=torch.long),
            "word_starts": torch.tensor(first_subword, dtype=torch.long),
            "upos": torch.tensor([UPOS_TO_ID[tag] for tag in sentence.upos], dtype=torch.long),
            "heads": torch.tensor(sentence.heads, dtype=torch.long),
            "relations": torch.tensor(
                [self.relation_to_id[label] for label in sentence.relations], dtype=torch.long
            ),
            "rule_weights": torch.tensor(sentence.rule_weights, dtype=torch.float),
        }

    def __getitem__(self, index: int) -> dict[str, dict[str, torch.Tensor]]:
        sentence = self.sentences[index]
        return {
            "student": self._encode(sentence, self.student_tokenizer),
            "teacher": self._encode(sentence, self.teacher_tokenizer),
        }


def collate_paired(
    examples: list[dict[str, dict[str, torch.Tensor]]],
) -> dict[str, dict[str, torch.Tensor]]:
    return {
        "student": collate([example["student"] for example in examples]),
        "teacher": collate([example["teacher"] for example in examples]),
    }


def collate(examples: list[dict[str, torch.Tensor]]) -> dict[str, torch.Tensor]:
    batch = len(examples)
    max_subwords = max(example["input_ids"].numel() for example in examples)
    max_words = max(example["word_starts"].numel() for example in examples)
    output = {
        "input_ids": torch.zeros(batch, max_subwords, dtype=torch.long),
        "attention_mask": torch.zeros(batch, max_subwords, dtype=torch.long),
        "word_starts": torch.zeros(batch, max_words, dtype=torch.long),
        "word_mask": torch.zeros(batch, max_words, dtype=torch.bool),
        "upos": torch.full((batch, max_words), -100, dtype=torch.long),
        "heads": torch.full((batch, max_words), -100, dtype=torch.long),
        "relations": torch.full((batch, max_words), -100, dtype=torch.long),
        "rule_weights": torch.ones(batch, max_words, dtype=torch.float),
    }
    for row, example in enumerate(examples):
        subwords = example["input_ids"].numel()
        words = example["word_starts"].numel()
        output["input_ids"][row, :subwords] = example["input_ids"]
        output["attention_mask"][row, :subwords] = example["attention_mask"]
        output["word_starts"][row, :words] = example["word_starts"]
        output["word_mask"][row, :words] = True
        for key in ("upos", "heads", "relations", "rule_weights"):
            output[key][row, :words] = example[key]
    return output
