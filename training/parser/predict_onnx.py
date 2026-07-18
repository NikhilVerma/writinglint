"""Write ParsedSentence JSONL using only exported ONNX graphs and tokenizer assets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from torch.utils.data import DataLoader
from transformers import AutoTokenizer

from data import DependencyDataset, collate
from decode import decode_tree, valid_tree
from predict_conllu import parsed, source_sentences


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--data-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()
    manifest = json.loads((args.model / "manifest.json").read_text())
    relation_to_id = {label: index for index, label in enumerate(manifest["relations"])}
    tokenizer = AutoTokenizer.from_pretrained(args.model / "tokenizer", use_fast=True)
    dataset = DependencyDataset(args.data_file, tokenizer, relation_to_id, 256)
    sources = source_sentences(args.data_file)
    loader = DataLoader(dataset, batch_size=args.batch_size, collate_fn=collate, num_workers=4)
    parser_session = ort.InferenceSession(str(args.model / "parser.onnx"), providers=["CPUExecutionProvider"])
    relation_session = ort.InferenceSession(str(args.model / "relations.onnx"), providers=["CPUExecutionProvider"])
    records: list[dict] = []
    source_index = 0
    for batch in loader:
        outputs = parser_session.run(None, {
            "input_ids": batch["input_ids"].numpy(), "attention_mask": batch["attention_mask"].numpy(),
            "word_starts": batch["word_starts"].numpy(), "word_mask": batch["word_mask"].numpy(),
        })
        selected = np.zeros(batch["heads"].shape, dtype=np.int64)
        counts: list[int] = []
        for row in range(batch["word_mask"].shape[0]):
            count = int(batch["word_mask"][row].sum())
            counts.append(count)
            heads = decode_tree(outputs[1][row, :count, :count + 1].tolist())
            if not valid_tree(heads):
                raise RuntimeError(f"Decoder produced an invalid tree at sentence {source_index + row}")
            selected[row, :count] = heads
        relation_logits = relation_session.run(None, {
            "relation_dependent": outputs[2], "relation_heads": outputs[3], "selected_heads": selected,
        })[0]
        for row, count in enumerate(counts):
            item = sources[source_index]
            gold_tokens = item["tokens"]
            text = item["text"]
            records.append({
                "family": item["family"], "text": text,
                "gold": parsed(
                    text, gold_tokens, [int(token["head"]) for token in gold_tokens],
                    [str(token["deprel"]) for token in gold_tokens], [str(token["upos"]) for token in gold_tokens],
                ),
                "predicted": parsed(
                    text, gold_tokens, selected[row, :count].tolist(),
                    [manifest["relations"][index] for index in relation_logits[row, :count].argmax(-1).tolist()],
                    [manifest["upos"][index] for index in outputs[0][row, :count].argmax(-1).tolist()],
                ),
            })
            source_index += 1
    args.output.write_text("\n".join(json.dumps(record) for record in records) + "\n")
    print(json.dumps({"sentences": len(records), "validTrees": len(records)}))


if __name__ == "__main__":
    main()
