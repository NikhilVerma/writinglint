"""Distil word-aligned structured distributions from a strong parser teacher."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import numpy as np
import torch
from torch.nn import functional as F
from torch.optim import AdamW
from torch.utils.data import ConcatDataset, DataLoader
from tqdm import tqdm
from transformers import AutoTokenizer, get_linear_schedule_with_warmup

from arguments import nonnegative_float, nonnegative_int, positive_float, positive_int
from data import UPOS, PairedDependencyDataset, collate, collate_paired
from model import CompactDependencyParser
from paths import portable_reference
from train import evaluate, find_split, losses


def distribution_kl(
    student: torch.Tensor,
    teacher: torch.Tensor,
    temperature: float,
    weights: torch.Tensor | None = None,
) -> torch.Tensor:
    """Mean token-level KL(teacher || student), with standard T squared scaling."""
    token_kl = (
        F.kl_div(
            F.log_softmax(student.float() / temperature, dim=-1),
            F.softmax(teacher.float() / temperature, dim=-1),
            reduction="none",
        ).sum(-1)
        * temperature**2
    )
    if weights is None:
        return token_kl.mean()
    normalized = weights.float() / weights.float().mean().clamp_min(1e-6)
    return (token_kl * normalized).mean()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--teacher", type=Path, required=True)
    parser.add_argument("--student-encoder", default="google/bert_uncased_L-4_H-256_A-4")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--epochs", type=positive_int, default=12)
    parser.add_argument("--batch-size", type=positive_int, default=12)
    parser.add_argument("--learning-rate", type=positive_float, default=5e-5)
    parser.add_argument("--head-learning-rate", type=positive_float, default=5e-4)
    parser.add_argument("--temperature", type=positive_float, default=2.0)
    parser.add_argument("--gold-weight", type=nonnegative_float, default=0.5)
    parser.add_argument("--distill-weight", type=nonnegative_float, default=0.5)
    parser.add_argument("--max-subwords", type=positive_int, default=256)
    parser.add_argument("--rule-data", type=Path)
    parser.add_argument("--rule-eval", type=Path)
    parser.add_argument("--rule-repeat", type=nonnegative_int, default=10)
    parser.add_argument("--arc-size", type=positive_int, default=256)
    parser.add_argument("--relation-size", type=positive_int, default=128)
    parser.add_argument("--scale-biaffine", action="store_true")
    parser.add_argument("--seed", type=int, default=13)
    args = parser.parse_args()
    if args.gold_weight + args.distill_weight <= 0:
        parser.error("at least one of --gold-weight or --distill-weight must be greater than zero")

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type == "cuda":
        torch.cuda.manual_seed_all(args.seed)
        torch.set_float32_matmul_precision("high")

    teacher_config = json.loads((args.teacher / "config.json").read_text(encoding="utf-8"))
    relations = teacher_config["relations"]
    relation_to_id = {label: index for index, label in enumerate(relations)}
    student_tokenizer = AutoTokenizer.from_pretrained(args.student_encoder, use_fast=True)
    teacher_tokenizer = AutoTokenizer.from_pretrained(args.teacher / "tokenizer", use_fast=True)

    def paired(split: str) -> PairedDependencyDataset:
        return PairedDependencyDataset(
            find_split(args.data_dir, split),
            student_tokenizer,
            teacher_tokenizer,
            relation_to_id,
            args.max_subwords,
        )

    train_data, dev_data, test_data = paired("train"), paired("dev"), paired("test")
    for name, dataset in (("train", train_data), ("dev", dev_data), ("test", test_data)):
        if not dataset:
            raise ValueError(f"{name} dataset is empty after token-length filtering")
    training_sets = [train_data]
    if args.rule_data:
        rule_data = PairedDependencyDataset(
            args.rule_data, student_tokenizer, teacher_tokenizer, relation_to_id, args.max_subwords
        )
        training_sets.extend([rule_data] * args.rule_repeat)
    combined_train = ConcatDataset(training_sets)
    train_loader = DataLoader(
        combined_train,
        batch_size=args.batch_size,
        shuffle=True,
        collate_fn=collate_paired,
        num_workers=4,
    )
    dev_loader = DataLoader(
        [dev_data[index]["student"] for index in range(len(dev_data))],
        batch_size=args.batch_size * 4,
        collate_fn=collate,
        num_workers=4,
    )
    test_loader = DataLoader(
        [test_data[index]["student"] for index in range(len(test_data))],
        batch_size=args.batch_size * 4,
        collate_fn=collate,
        num_workers=4,
    )
    rule_eval_loader = None
    if args.rule_eval:
        rule_eval_data = PairedDependencyDataset(
            args.rule_eval, student_tokenizer, teacher_tokenizer, relation_to_id, args.max_subwords
        )
        rule_eval_loader = DataLoader(
            [rule_eval_data[index]["student"] for index in range(len(rule_eval_data))],
            batch_size=args.batch_size * 4,
            collate_fn=collate,
            num_workers=4,
        )

    teacher = CompactDependencyParser(
        teacher_config["encoder"],
        len(UPOS),
        len(relations),
        teacher_config.get("arc_size", 256),
        teacher_config.get("relation_size", 128),
        scale_biaffine=teacher_config.get("scale_biaffine", False),
    ).to(device)
    teacher.load_state_dict(
        torch.load(args.teacher / "model.pt", map_location=device, weights_only=True)
    )
    teacher.eval().requires_grad_(False)
    student = CompactDependencyParser(
        args.student_encoder,
        len(UPOS),
        len(relations),
        args.arc_size,
        args.relation_size,
        scale_biaffine=args.scale_biaffine,
    ).to(device)

    encoder_parameters = list(student.encoder.parameters())
    encoder_ids = {id(parameter) for parameter in encoder_parameters}
    head_parameters = [
        parameter for parameter in student.parameters() if id(parameter) not in encoder_ids
    ]
    optimizer = AdamW(
        [
            {"params": encoder_parameters, "lr": args.learning_rate},
            {"params": head_parameters, "lr": args.head_learning_rate},
        ],
        weight_decay=0.01,
    )
    steps = args.epochs * len(train_loader)
    scheduler = get_linear_schedule_with_warmup(optimizer, int(steps * 0.1), steps)
    scaler = torch.amp.GradScaler("cuda", enabled=device.type == "cuda")

    args.output.mkdir(parents=True, exist_ok=True)
    metadata = {
        "encoder": args.student_encoder,
        "upos": UPOS,
        "relations": relations,
        "seed": args.seed,
        "teacher": portable_reference(args.teacher),
        "temperature": args.temperature,
        "gold_weight": args.gold_weight,
        "distill_weight": args.distill_weight,
        "arc_size": args.arc_size,
        "relation_size": args.relation_size,
        "scale_biaffine": args.scale_biaffine,
        "rule_data": portable_reference(args.rule_data) if args.rule_data else None,
        "rule_repeat": args.rule_repeat,
    }
    (args.output / "config.json").write_text(
        json.dumps(metadata, indent=2) + "\n",
        encoding="utf-8",
    )
    student_tokenizer.save_pretrained(args.output / "tokenizer")

    best_las = -1.0
    for epoch in range(1, args.epochs + 1):
        student.train()
        progress = tqdm(train_loader, desc=f"distill epoch {epoch}")
        for paired_batch in progress:
            student_batch = {
                key: value.to(device) for key, value in paired_batch["student"].items()
            }
            teacher_batch = {
                key: value.to(device) for key, value in paired_batch["teacher"].items()
            }
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast(
                device_type=device.type, dtype=torch.bfloat16, enabled=device.type == "cuda"
            ):
                with torch.no_grad():
                    teacher_output = teacher(
                        teacher_batch["input_ids"],
                        teacher_batch["attention_mask"],
                        teacher_batch["word_starts"],
                        teacher_batch["word_mask"],
                        teacher_batch["heads"],
                    )
                student_output = student(
                    student_batch["input_ids"],
                    student_batch["attention_mask"],
                    student_batch["word_starts"],
                    student_batch["word_mask"],
                    student_batch["heads"],
                )
                gold_loss, _ = losses(student_output, student_batch)
                valid = student_batch["word_mask"]
                kd_weights = student_batch["rule_weights"][valid]
                if student_output.relation_logits is None or teacher_output.relation_logits is None:
                    raise RuntimeError("Distillation requires relation logits from both parsers")
                kd_upos = distribution_kl(
                    student_output.upos_logits[valid],
                    teacher_output.upos_logits[valid],
                    args.temperature,
                    kd_weights,
                )
                kd_arc = distribution_kl(
                    student_output.arc_logits[valid],
                    teacher_output.arc_logits[valid],
                    args.temperature,
                    kd_weights,
                )
                kd_relation = distribution_kl(
                    student_output.relation_logits[valid],
                    teacher_output.relation_logits[valid],
                    args.temperature,
                    kd_weights,
                )
                kd_loss = (kd_upos + kd_arc + kd_relation) / 3
                loss = args.gold_weight * gold_loss + args.distill_weight * kd_loss
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(student.parameters(), 1.0)
            scaler.step(optimizer)
            scaler.update()
            scheduler.step()
            progress.set_postfix(
                loss=f"{loss.item():.3f}",
                gold=f"{gold_loss.item():.3f}",
                kd=f"{kd_loss.item():.3f}",
            )

        metrics = evaluate(student, dev_loader, device, dev_data.skipped_sentences)
        print(json.dumps({"epoch": epoch, "dev": metrics}))
        if metrics["las_no_punct"] > best_las:
            best_las = metrics["las_no_punct"]
            torch.save(student.state_dict(), args.output / "model.pt")

    student.load_state_dict(
        torch.load(args.output / "model.pt", map_location=device, weights_only=True)
    )
    print(
        json.dumps(
            {"test": evaluate(student, test_loader, device, test_data.skipped_sentences)},
            indent=2,
        )
    )
    if rule_eval_loader is not None:
        print(
            json.dumps(
                {
                    "rule_eval": evaluate(
                        student,
                        rule_eval_loader,
                        device,
                        rule_eval_data.skipped_sentences,
                    )
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
