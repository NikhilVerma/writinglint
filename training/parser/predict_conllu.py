"""Write gold and predicted ParsedSentence JSONL for end-to-end rule evaluation."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from torch.utils.data import DataLoader
from transformers import AutoTokenizer

from arguments import positive_int
from data import DependencyDataset, collate
from decode import decode_tree, valid_tree
from model import CompactDependencyParser
from records import ComparisonRecord, parsed


@torch.no_grad()
def main() -> None:
    args_parser = argparse.ArgumentParser()
    args_parser.add_argument("--data-file", type=Path, required=True)
    args_parser.add_argument("--checkpoint", type=Path, required=True)
    args_parser.add_argument("--output", type=Path, required=True)
    args_parser.add_argument("--batch-size", type=positive_int, default=96)
    args = args_parser.parse_args()

    config = json.loads((args.checkpoint / "config.json").read_text(encoding="utf-8"))
    relation_to_id = {label: index for index, label in enumerate(config["relations"])}
    tokenizer = AutoTokenizer.from_pretrained(args.checkpoint / "tokenizer", use_fast=True)
    dataset = DependencyDataset(args.data_file, tokenizer, relation_to_id, 256)
    loader = DataLoader(dataset, batch_size=args.batch_size, collate_fn=collate, num_workers=4)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = CompactDependencyParser(
        config["encoder"],
        len(config["upos"]),
        len(config["relations"]),
        config.get("arc_size", 256),
        config.get("relation_size", 128),
        scale_biaffine=config.get("scale_biaffine", False),
    ).to(device)
    model.load_state_dict(
        torch.load(args.checkpoint / "model.pt", map_location=device, weights_only=True)
    )
    model.eval()

    records: list[ComparisonRecord] = []
    source_index = 0
    for batch in loader:
        batch = {key: value.to(device) for key, value in batch.items()}
        output = model(
            batch["input_ids"], batch["attention_mask"], batch["word_starts"], batch["word_mask"]
        )
        predicted_heads = torch.zeros_like(batch["heads"])
        for row in range(batch["word_mask"].shape[0]):
            count = int(batch["word_mask"][row].sum().item())
            scores = output.arc_logits[row, :count, : count + 1].float().cpu().tolist()
            heads = decode_tree(scores)
            if not valid_tree(heads):
                raise RuntimeError(
                    f"Decoder produced an invalid tree at sentence {source_index + row}"
                )
            predicted_heads[row, :count] = torch.tensor(heads, device=device)
        predicted_relations = model.score_relations(
            output.relation_dependent, output.relation_heads, predicted_heads
        ).argmax(-1)
        predicted_upos = output.upos_logits.argmax(-1)
        for row in range(batch["word_mask"].shape[0]):
            count = int(batch["word_mask"][row].sum().item())
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
                        predicted_heads[row, :count].tolist(),
                        [
                            config["relations"][index]
                            for index in predicted_relations[row, :count].tolist()
                        ],
                        [config["upos"][index] for index in predicted_upos[row, :count].tolist()],
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


if __name__ == "__main__":
    main()
