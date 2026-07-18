"""Train and evaluate a compact joint POS/dependency parser."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import numpy as np
import torch
from torch.nn import functional as F
from torch.optim import AdamW
from torch.utils.data import DataLoader
from tqdm import tqdm
from transformers import AutoTokenizer, get_linear_schedule_with_warmup

from data import DependencyDataset, UPOS, collate, relation_vocabulary
from decode import decode_tree
from model import CompactDependencyParser


def find_split(data_dir: Path, split: str) -> Path:
    matches = list(data_dir.glob(f"*-ud-{split}.conllu"))
    if len(matches) != 1:
        raise FileNotFoundError(f"Expected one {split} CoNLL-U file in {data_dir}, found {matches}")
    return matches[0]


def losses(output, batch: dict[str, torch.Tensor]) -> tuple[torch.Tensor, dict[str, float]]:
    valid = batch["word_mask"]
    weights = batch.get("rule_weights", torch.ones_like(batch["heads"], dtype=torch.float))[valid]
    weights = weights / weights.mean().clamp_min(1e-6)
    upos_loss = (F.cross_entropy(output.upos_logits[valid], batch["upos"][valid], reduction="none") * weights).mean()
    arc_loss = (F.cross_entropy(output.arc_logits[valid], batch["heads"][valid], reduction="none") * weights).mean()
    assert output.relation_logits is not None
    relation_loss = (
        F.cross_entropy(output.relation_logits[valid], batch["relations"][valid], reduction="none") * weights
    ).mean()
    total = upos_loss + arc_loss + relation_loss
    return total, {"upos": upos_loss.item(), "arc": arc_loss.item(), "relation": relation_loss.item()}


@torch.no_grad()
def evaluate(model, loader: DataLoader, device: torch.device) -> dict[str, float]:
    model.eval()
    tokens = upos_correct = uas_correct = las_correct = roots_correct = roots = 0
    syntax_tokens = syntax_uas_correct = syntax_las_correct = 0
    critical_tokens = critical_uas_correct = critical_las_correct = 0
    punct_id = UPOS.index("PUNCT")
    for batch in loader:
        batch = {key: value.to(device) for key, value in batch.items()}
        output = model(batch["input_ids"], batch["attention_mask"], batch["word_starts"], batch["word_mask"])
        valid = batch["word_mask"]
        predicted_upos = output.upos_logits.argmax(-1)
        predicted_heads = torch.zeros_like(batch["heads"])
        for row in range(valid.shape[0]):
            count = int(valid[row].sum().item())
            scores = output.arc_logits[row, :count, :count + 1].float().cpu().tolist()
            predicted_heads[row, :count] = torch.tensor(decode_tree(scores), device=device)
        predicted_relations = model.score_relations(
            output.relation_dependent, output.relation_heads, predicted_heads
        ).argmax(-1)
        head_correct = predicted_heads.eq(batch["heads"])
        relation_correct = predicted_relations.eq(batch["relations"])
        tokens += valid.sum().item()
        upos_correct += (predicted_upos.eq(batch["upos"]) & valid).sum().item()
        uas_correct += (head_correct & valid).sum().item()
        las_correct += (head_correct & relation_correct & valid).sum().item()
        # CoNLL dependency parsing convention excludes punctuation from UAS/LAS.
        syntax_valid = valid & batch["upos"].ne(punct_id)
        syntax_tokens += syntax_valid.sum().item()
        syntax_uas_correct += (head_correct & syntax_valid).sum().item()
        syntax_las_correct += (head_correct & relation_correct & syntax_valid).sum().item()
        critical = valid & batch.get("rule_weights", torch.ones_like(batch["heads"], dtype=torch.float)).gt(1)
        critical_tokens += critical.sum().item()
        critical_uas_correct += (head_correct & critical).sum().item()
        critical_las_correct += (head_correct & relation_correct & critical).sum().item()
        root_mask = batch["heads"].eq(0) & valid
        roots += root_mask.sum().item()
        roots_correct += (predicted_heads.eq(0) & root_mask).sum().item()
    return {
        "upos": upos_correct / max(tokens, 1),
        "uas": uas_correct / max(tokens, 1),
        "las": las_correct / max(tokens, 1),
        "uas_no_punct": syntax_uas_correct / max(syntax_tokens, 1),
        "las_no_punct": syntax_las_correct / max(syntax_tokens, 1),
        "root": roots_correct / max(roots, 1),
        "tokens": tokens,
        "syntax_tokens": syntax_tokens,
        "critical_uas": critical_uas_correct / max(critical_tokens, 1),
        "critical_las": critical_las_correct / max(critical_tokens, 1),
        "critical_tokens": critical_tokens,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--encoder", default="google/electra-small-discriminator")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--learning-rate", type=float, default=5e-5)
    parser.add_argument("--head-learning-rate", type=float, default=5e-4)
    parser.add_argument("--warmup-ratio", type=float, default=0.1)
    parser.add_argument("--max-subwords", type=int, default=256)
    parser.add_argument("--arc-size", type=int, default=256)
    parser.add_argument("--relation-size", type=int, default=128)
    parser.add_argument("--scale-biaffine", action="store_true")
    parser.add_argument("--seed", type=int, default=13)
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type == "cuda":
        torch.cuda.manual_seed_all(args.seed)
        torch.set_float32_matmul_precision("high")

    train_path = find_split(args.data_dir, "train")
    dev_path = find_split(args.data_dir, "dev")
    test_path = find_split(args.data_dir, "test")
    # Reading test labels defines the output vocabulary but never exposes test
    # inputs or structures to optimization/model selection.
    relations = relation_vocabulary([train_path, dev_path, test_path])
    relation_to_id = {label: index for index, label in enumerate(relations)}
    tokenizer = AutoTokenizer.from_pretrained(args.encoder, use_fast=True)
    train_data = DependencyDataset(train_path, tokenizer, relation_to_id, args.max_subwords)
    dev_data = DependencyDataset(dev_path, tokenizer, relation_to_id, args.max_subwords)
    test_data = DependencyDataset(test_path, tokenizer, relation_to_id, args.max_subwords)
    train_loader = DataLoader(train_data, batch_size=args.batch_size, shuffle=True, collate_fn=collate, num_workers=4)
    dev_loader = DataLoader(dev_data, batch_size=args.batch_size * 2, collate_fn=collate, num_workers=4)
    test_loader = DataLoader(test_data, batch_size=args.batch_size * 2, collate_fn=collate, num_workers=4)

    model = CompactDependencyParser(
        args.encoder, len(UPOS), len(relations), args.arc_size, args.relation_size,
        scale_biaffine=args.scale_biaffine,
    ).to(device)
    encoder_parameters = list(model.encoder.parameters())
    encoder_ids = {id(parameter) for parameter in encoder_parameters}
    head_parameters = [parameter for parameter in model.parameters() if id(parameter) not in encoder_ids]
    optimizer = AdamW(
        [
            {"params": encoder_parameters, "lr": args.learning_rate},
            {"params": head_parameters, "lr": args.head_learning_rate},
        ],
        weight_decay=0.01,
    )
    steps = args.epochs * len(train_loader)
    scheduler = get_linear_schedule_with_warmup(optimizer, int(steps * args.warmup_ratio), steps)
    scaler = torch.amp.GradScaler("cuda", enabled=device.type == "cuda")
    args.output.mkdir(parents=True, exist_ok=True)
    metadata = {
        "encoder": args.encoder, "upos": UPOS, "relations": relations, "seed": args.seed,
        "arc_size": args.arc_size, "relation_size": args.relation_size,
        "scale_biaffine": args.scale_biaffine,
    }
    (args.output / "config.json").write_text(json.dumps(metadata, indent=2) + "\n")
    tokenizer.save_pretrained(args.output / "tokenizer")

    best_las = -1.0
    for epoch in range(1, args.epochs + 1):
        model.train()
        progress = tqdm(train_loader, desc=f"epoch {epoch}")
        for batch in progress:
            batch = {key: value.to(device) for key, value in batch.items()}
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast(device_type=device.type, dtype=torch.bfloat16, enabled=device.type == "cuda"):
                output = model(
                    batch["input_ids"],
                    batch["attention_mask"],
                    batch["word_starts"],
                    batch["word_mask"],
                    batch["heads"],
                )
                loss, parts = losses(output, batch)
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(optimizer)
            scaler.update()
            scheduler.step()
            progress.set_postfix(loss=f"{loss.item():.3f}", **{key: f"{value:.2f}" for key, value in parts.items()})

        metrics = evaluate(model, dev_loader, device)
        print(json.dumps({"epoch": epoch, "dev": metrics}))
        if metrics["las_no_punct"] > best_las:
            best_las = metrics["las_no_punct"]
            torch.save(model.state_dict(), args.output / "model.pt")

    model.load_state_dict(torch.load(args.output / "model.pt", map_location=device, weights_only=True))
    print(json.dumps({"test": evaluate(model, test_loader, device)}, indent=2))


if __name__ == "__main__":
    main()
