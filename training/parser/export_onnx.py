"""Export the compact parser to a two-stage ONNX runtime pipeline and validate parity."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
from torch import nn
from torch.utils.data import DataLoader
from transformers import AutoTokenizer, PreTrainedTokenizerBase

from arguments import positive_int
from data import DependencyDataset, collate
from decode import decode_tree, valid_tree
from model import CompactDependencyParser
from paths import portable_reference


class ParserGraph(nn.Module):
    def __init__(self, parser: CompactDependencyParser) -> None:
        super().__init__()
        self.parser = parser

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor,
        word_starts: torch.Tensor,
        word_mask: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        output = self.parser(input_ids, attention_mask, word_starts, word_mask)
        return (
            output.upos_logits,
            output.arc_logits,
            output.relation_dependent,
            output.relation_heads,
        )


class RelationGraph(nn.Module):
    def __init__(self, parser: CompactDependencyParser) -> None:
        super().__init__()
        self.parser = parser

    def forward(
        self,
        relation_dependent: torch.Tensor,
        relation_heads: torch.Tensor,
        selected_heads: torch.Tensor,
    ) -> torch.Tensor:
        return self.parser.score_relations(relation_dependent, relation_heads, selected_heads)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def export_graphs(
    model: CompactDependencyParser,
    tokenizer: PreTrainedTokenizerBase,
    output: Path,
) -> tuple[Path, Path]:
    parser_path, relation_path = output / "parser.onnx", output / "relations.onnx"
    encoded = tokenizer(
        ["This", "is", "a", "test", "."],
        is_split_into_words=True,
        add_special_tokens=True,
        return_tensors="pt",
    )
    input_ids = encoded["input_ids"]
    attention_mask = encoded["attention_mask"]
    word_ids = encoded.word_ids()
    word_starts = torch.tensor(
        [
            [
                index
                for index, word_id in enumerate(word_ids)
                if word_id is not None and (index == 0 or word_ids[index - 1] != word_id)
            ]
        ],
        dtype=torch.long,
    )
    word_mask = torch.ones_like(word_starts, dtype=torch.bool)
    parser_graph = ParserGraph(model).eval()
    relation_graph = RelationGraph(model).eval()
    with torch.no_grad():
        projections = parser_graph(input_ids, attention_mask, word_starts, word_mask)

    torch.onnx.export(
        parser_graph,
        (input_ids, attention_mask, word_starts, word_mask),
        parser_path,
        input_names=["input_ids", "attention_mask", "word_starts", "word_mask"],
        output_names=["upos_logits", "arc_logits", "relation_dependent", "relation_heads"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "subwords"},
            "attention_mask": {0: "batch", 1: "subwords"},
            "word_starts": {0: "batch", 1: "words"},
            "word_mask": {0: "batch", 1: "words"},
            "upos_logits": {0: "batch", 1: "words"},
            "arc_logits": {0: "batch", 1: "words", 2: "heads"},
            "relation_dependent": {0: "batch", 1: "words"},
            "relation_heads": {0: "batch", 1: "heads"},
        },
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )
    selected_heads = torch.zeros_like(word_starts)
    torch.onnx.export(
        relation_graph,
        (projections[2], projections[3], selected_heads),
        relation_path,
        input_names=["relation_dependent", "relation_heads", "selected_heads"],
        output_names=["relation_logits"],
        dynamic_axes={
            "relation_dependent": {0: "batch", 1: "words"},
            "relation_heads": {0: "batch", 1: "heads"},
            "selected_heads": {0: "batch", 1: "words"},
            "relation_logits": {0: "batch", 1: "words"},
        },
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )
    onnx.checker.check_model(onnx.load(parser_path))
    onnx.checker.check_model(onnx.load(relation_path))
    return parser_path, relation_path


@torch.no_grad()
def validate(
    model: CompactDependencyParser,
    checkpoint: Path,
    data_file: Path,
    parser_path: Path,
    relation_path: Path,
    batch_size: int,
) -> dict[str, object]:
    model.eval()
    config = json.loads((checkpoint / "config.json").read_text(encoding="utf-8"))
    relation_to_id = {label: index for index, label in enumerate(config["relations"])}
    tokenizer = AutoTokenizer.from_pretrained(checkpoint / "tokenizer", use_fast=True)
    dataset = DependencyDataset(data_file, tokenizer, relation_to_id, 256)
    loader = DataLoader(dataset, batch_size=batch_size, collate_fn=collate, num_workers=4)
    parser_session = ort.InferenceSession(str(parser_path), providers=["CPUExecutionProvider"])
    relation_session = ort.InferenceSession(str(relation_path), providers=["CPUExecutionProvider"])
    maximum = {
        name: 0.0
        for name in (
            "upos_logits",
            "arc_logits",
            "relation_dependent",
            "relation_heads",
            "relation_logits",
        )
    }
    tokens = upos_equal = head_equal = relation_equal = trees = 0
    batches = 0
    for batch in loader:
        inputs = {
            "input_ids": batch["input_ids"].numpy(),
            "attention_mask": batch["attention_mask"].numpy(),
            "word_starts": batch["word_starts"].numpy(),
            "word_mask": batch["word_mask"].numpy(),
        }
        torch_output = model(
            batch["input_ids"], batch["attention_mask"], batch["word_starts"], batch["word_mask"]
        )
        ort_outputs = parser_session.run(None, inputs)
        names = ["upos_logits", "arc_logits", "relation_dependent", "relation_heads"]
        torch_values = [
            torch_output.upos_logits,
            torch_output.arc_logits,
            torch_output.relation_dependent,
            torch_output.relation_heads,
        ]
        for name, torch_value, ort_value in zip(names, torch_values, ort_outputs, strict=True):
            maximum[name] = max(
                maximum[name], float(np.max(np.abs(torch_value.numpy() - ort_value)))
            )

        selected = np.zeros(batch["heads"].shape, dtype=np.int64)
        for row in range(batch["word_mask"].shape[0]):
            count = int(batch["word_mask"][row].sum())
            heads = decode_tree(ort_outputs[1][row, :count, : count + 1].tolist())
            trees += int(valid_tree(heads))
            selected[row, :count] = heads
            torch_heads = decode_tree(torch_output.arc_logits[row, :count, : count + 1].tolist())
            head_equal += sum(left == right for left, right in zip(heads, torch_heads, strict=True))
        ort_relations = relation_session.run(
            None,
            {
                "relation_dependent": ort_outputs[2],
                "relation_heads": ort_outputs[3],
                "selected_heads": selected,
            },
        )[0]
        torch_relations = model.score_relations(
            torch_output.relation_dependent, torch_output.relation_heads, torch.from_numpy(selected)
        ).numpy()
        maximum["relation_logits"] = max(
            maximum["relation_logits"], float(np.max(np.abs(torch_relations - ort_relations)))
        )
        valid = batch["word_mask"].numpy()
        tokens += int(valid.sum())
        upos_equal += int(
            (
                (torch_output.upos_logits.argmax(-1).numpy() == ort_outputs[0].argmax(-1)) & valid
            ).sum()
        )
        relation_equal += int(
            ((torch_relations.argmax(-1) == ort_relations.argmax(-1)) & valid).sum()
        )
        batches += 1
    return {
        "sentences": len(dataset),
        "tokens": tokens,
        "batches": batches,
        "max_abs_difference": maximum,
        "upos_argmax_agreement": upos_equal / max(tokens, 1),
        "head_agreement": head_equal / max(tokens, 1),
        "relation_argmax_agreement": relation_equal / max(tokens, 1),
        "valid_tree_rate": trees / max(len(dataset), 1),
        "skipped_sentences": dataset.skipped_sentences,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--validation-data", type=Path, required=True)
    parser.add_argument("--batch-size", type=positive_int, default=32)
    args = parser.parse_args()
    config = json.loads((args.checkpoint / "config.json").read_text(encoding="utf-8"))
    model = CompactDependencyParser(
        config["encoder"],
        len(config["upos"]),
        len(config["relations"]),
        config.get("arc_size", 256),
        config.get("relation_size", 128),
        scale_biaffine=config.get("scale_biaffine", False),
    )
    model.load_state_dict(
        torch.load(args.checkpoint / "model.pt", map_location="cpu", weights_only=True)
    )
    model.eval()
    args.output.mkdir(parents=True, exist_ok=True)
    tokenizer = AutoTokenizer.from_pretrained(args.checkpoint / "tokenizer", use_fast=True)
    tokenizer.save_pretrained(args.output / "tokenizer")
    parser_path, relation_path = export_graphs(model, tokenizer, args.output)
    result = validate(
        model, args.checkpoint, args.validation_data, parser_path, relation_path, args.batch_size
    )
    artifact_paths = [parser_path, relation_path, *sorted((args.output / "tokenizer").iterdir())]
    manifest = {
        "format": "writinglint-compact-parser-onnx-v1",
        "opset": 17,
        "checkpoint": portable_reference(args.checkpoint),
        "encoder": config["encoder"],
        "source_checkpoint_sha256": sha256(args.checkpoint / "model.pt"),
        "upos": config["upos"],
        "relations": config["relations"],
        "artifacts": {
            str(path.relative_to(args.output)): {
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }
            for path in artifact_paths
            if path.is_file()
        },
        "validation": result,
    }
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
