"""Write gold and predicted ParsedSentence JSONL for end-to-end rule evaluation."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from conllu import parse_incr
from torch.utils.data import DataLoader
from transformers import AutoTokenizer

from data import DependencyDataset, UPOS, collate
from decode import decode_tree, valid_tree
from model import CompactDependencyParser


def source_sentences(path: Path) -> list[dict]:
    output = []
    with path.open(encoding="utf-8") as source:
        for sentence in parse_incr(source):
            tokens = [token for token in sentence if isinstance(token["id"], int)]
            output.append({
                "text": sentence.metadata.get("text", " ".join(str(token["form"]) for token in tokens)),
                "family": sentence.metadata.get("family", "unknown"),
                "tokens": tokens,
            })
    return output


def offsets(text: str, forms: list[str]) -> list[tuple[int, int]]:
    result, cursor = [], 0
    for form in forms:
        start = text.find(form, cursor)
        if start < 0:
            raise ValueError(f"Could not align {form!r} after {cursor} in {text!r}")
        end = start + len(form)
        result.append((start, end))
        cursor = end
    return result


def parsed(text: str, source: list[dict], heads: list[int], relations: list[str], upos: list[str]) -> dict:
    spans = offsets(text, [str(token["form"]) for token in source])
    return {
        "text": text, "start": 0, "end": len(text),
        "tokens": [
            {
                "id": index + 1, "form": str(token["form"]), "lemma": str(token.get("lemma") or token["form"]).lower(),
                "upos": upos[index], "head": heads[index], "deprel": relations[index],
                "start": spans[index][0], "end": spans[index][1],
            }
            for index, token in enumerate(source)
        ],
    }


@torch.no_grad()
def main() -> None:
    args_parser = argparse.ArgumentParser()
    args_parser.add_argument("--data-file", type=Path, required=True)
    args_parser.add_argument("--checkpoint", type=Path, required=True)
    args_parser.add_argument("--output", type=Path, required=True)
    args_parser.add_argument("--batch-size", type=int, default=96)
    args = args_parser.parse_args()

    config = json.loads((args.checkpoint / "config.json").read_text())
    relation_to_id = {label: index for index, label in enumerate(config["relations"])}
    tokenizer = AutoTokenizer.from_pretrained(args.checkpoint / "tokenizer", use_fast=True)
    dataset = DependencyDataset(args.data_file, tokenizer, relation_to_id, 256)
    sources = source_sentences(args.data_file)
    loader = DataLoader(dataset, batch_size=args.batch_size, collate_fn=collate, num_workers=4)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = CompactDependencyParser(
        config["encoder"], len(config["upos"]), len(config["relations"]),
        config.get("arc_size", 256), config.get("relation_size", 128),
        scale_biaffine=config.get("scale_biaffine", False),
    ).to(device)
    model.load_state_dict(torch.load(args.checkpoint / "model.pt", map_location=device, weights_only=True))
    model.eval()

    records, source_index = [], 0
    for batch in loader:
        batch = {key: value.to(device) for key, value in batch.items()}
        output = model(batch["input_ids"], batch["attention_mask"], batch["word_starts"], batch["word_mask"])
        predicted_heads = torch.zeros_like(batch["heads"])
        for row in range(batch["word_mask"].shape[0]):
            count = int(batch["word_mask"][row].sum().item())
            scores = output.arc_logits[row, :count, :count + 1].float().cpu().tolist()
            heads = decode_tree(scores)
            assert valid_tree(heads)
            predicted_heads[row, :count] = torch.tensor(heads, device=device)
        predicted_relations = model.score_relations(
            output.relation_dependent, output.relation_heads, predicted_heads
        ).argmax(-1)
        predicted_upos = output.upos_logits.argmax(-1)
        for row in range(batch["word_mask"].shape[0]):
            count = int(batch["word_mask"][row].sum().item())
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
                    text, gold_tokens, predicted_heads[row, :count].tolist(),
                    [config["relations"][index] for index in predicted_relations[row, :count].tolist()],
                    [config["upos"][index] for index in predicted_upos[row, :count].tolist()],
                ),
            })
            source_index += 1
    args.output.write_text("\n".join(json.dumps(record) for record in records) + "\n")


if __name__ == "__main__":
    main()
