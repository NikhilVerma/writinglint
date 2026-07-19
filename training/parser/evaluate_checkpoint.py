"""Evaluate a saved parser checkpoint with stable, comparable metrics."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from torch.utils.data import DataLoader
from transformers import AutoTokenizer

from arguments import positive_int
from data import DependencyDataset, collate
from model import CompactDependencyParser
from train import evaluate, find_split


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--data-file", type=Path)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--split", choices=("dev", "test"), default="test")
    parser.add_argument("--batch-size", type=positive_int, default=96)
    parser.add_argument("--max-subwords", type=positive_int, default=256)
    args = parser.parse_args()

    config = json.loads((args.checkpoint / "config.json").read_text(encoding="utf-8"))
    relation_to_id = {label: index for index, label in enumerate(config["relations"])}
    tokenizer = AutoTokenizer.from_pretrained(args.checkpoint / "tokenizer", use_fast=True)
    data_path = args.data_file or find_split(args.data_dir, args.split)
    dataset = DependencyDataset(data_path, tokenizer, relation_to_id, args.max_subwords)
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
    print(
        json.dumps(
            {args.split: evaluate(model, loader, device, dataset.skipped_sentences)},
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
