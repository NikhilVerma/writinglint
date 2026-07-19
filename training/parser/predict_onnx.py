"""Write ParsedSentence JSONL using only exported ONNX graphs and tokenizer assets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from torch.utils.data import DataLoader
from transformers import AutoTokenizer

from arguments import positive_int
from data import DependencyDataset, collate
from decode import decode_tree, valid_tree
from records import ComparisonRecord, parsed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--data-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--batch-size", type=positive_int, default=64)
    args = parser.parse_args()
    manifest = json.loads((args.model / "manifest.json").read_text(encoding="utf-8"))
    relation_to_id = {label: index for index, label in enumerate(manifest["relations"])}
    tokenizer = AutoTokenizer.from_pretrained(args.model / "tokenizer", use_fast=True)
    dataset = DependencyDataset(args.data_file, tokenizer, relation_to_id, 256)
    loader = DataLoader(dataset, batch_size=args.batch_size, collate_fn=collate, num_workers=4)
    parser_session = ort.InferenceSession(
        str(args.model / "parser.onnx"), providers=["CPUExecutionProvider"]
    )
    relation_session = ort.InferenceSession(
        str(args.model / "relations.onnx"), providers=["CPUExecutionProvider"]
    )
    records: list[ComparisonRecord] = []
    source_index = 0
    for batch in loader:
        outputs = parser_session.run(
            None,
            {
                "input_ids": batch["input_ids"].numpy(),
                "attention_mask": batch["attention_mask"].numpy(),
                "word_starts": batch["word_starts"].numpy(),
                "word_mask": batch["word_mask"].numpy(),
            },
        )
        selected = np.zeros(batch["heads"].shape, dtype=np.int64)
        counts: list[int] = []
        for row in range(batch["word_mask"].shape[0]):
            count = int(batch["word_mask"][row].sum())
            counts.append(count)
            heads = decode_tree(outputs[1][row, :count, : count + 1].tolist())
            if not valid_tree(heads):
                raise RuntimeError(
                    f"Decoder produced an invalid tree at sentence {source_index + row}"
                )
            selected[row, :count] = heads
        relation_logits = relation_session.run(
            None,
            {
                "relation_dependent": outputs[2],
                "relation_heads": outputs[3],
                "selected_heads": selected,
            },
        )[0]
        for row, count in enumerate(counts):
            sentence = dataset.sentences[source_index]
            records.append(
                {
                    "family": sentence.family,
                    "text": sentence.text,
                    "gold": parsed(
                        sentence,
                        sentence.heads,
                        sentence.relations,
                        sentence.upos,
                    ),
                    "predicted": parsed(
                        sentence,
                        selected[row, :count].tolist(),
                        [
                            manifest["relations"][index]
                            for index in relation_logits[row, :count].argmax(-1).tolist()
                        ],
                        [
                            manifest["upos"][index]
                            for index in outputs[0][row, :count].argmax(-1).tolist()
                        ],
                    ),
                }
            )
            source_index += 1
    if source_index != len(dataset):
        raise RuntimeError(
            f"Predicted {source_index} sentences for a {len(dataset)}-sentence dataset"
        )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "\n".join(json.dumps(record, ensure_ascii=False) for record in records) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"sentences": len(records), "validTrees": len(records)}))


if __name__ == "__main__":
    main()
