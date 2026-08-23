"""Full fine-tune of a small model on local hardware.

LoRA was a memory decision at 8B, not a quality one. Under about 2B the whole
model fits in the optimizer on one 4090, and a low-rank delta is the wrong tool
anyway: the student is not being nudged toward a style it already has, it is
being taught a task it fails outright.

    python train/sft_local.py --base-model HuggingFaceTB/SmolLM2-135M-Instruct \
        --out ~/models/sft-135m --epochs 3
"""
import argparse
import json
from pathlib import Path

import torch
from torch.utils.data import Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments

SIMPLIFY_DIR = Path(__file__).parents[1]

parser = argparse.ArgumentParser()
parser.add_argument("--base-model", required=True)
parser.add_argument("--out", required=True)
parser.add_argument("--data", default=str(SIMPLIFY_DIR / "train" / "data" / "v12" / "train.jsonl"))
parser.add_argument("--epochs", type=float, default=3.0)
parser.add_argument("--lr", type=float, default=5e-5)
parser.add_argument("--batch", type=int, default=1)
parser.add_argument("--accum", type=int, default=8)
# fp32 Adam wants about 16 bytes per parameter, which puts a 1.7B over a 24GB
# card before a single activation. The 8-bit states cost a third of that.
parser.add_argument("--optim", default="adamw_torch")
# An 8B does not fit a 24GB card as a full fine-tune, so the big model trains
# through an adapter and the small ones do not. Same script, same data, same
# eval — only the memory strategy differs.
parser.add_argument("--lora", action="store_true")
parser.add_argument("--lora-r", type=int, default=32)
# The escape hatch if bf16 weights plus a long document still will not fit: a
# 4-bit base costs about 5.5GB instead of 16.2GB and the adapter still trains
# in bf16.
parser.add_argument("--load-4bit", action="store_true")
args = parser.parse_args()

tok = AutoTokenizer.from_pretrained(args.base_model)
if tok.pad_token is None:
    tok.pad_token = tok.eos_token


class Pairs(Dataset):
    """Loss on the rewrite only.

    Training on the prompt tokens too would spend most of the gradient teaching
    the model to reproduce the instructions and the dirty source, which is the
    opposite of the thing being learned.

    Every document trains whole. There is no length cap: truncating the tail
    cuts the rewrite mid-sentence and takes its EOS with it, which teaches the
    model to stop in the middle of a document, and dropping the long ones
    trains away exactly the lengths that were already the weakest. The memory
    that a cap used to buy is bought by the fused cross-entropy instead.
    """

    def __init__(self, path: str):
        self.rows = []
        for line in open(path, encoding="utf8"):
            if not line.strip():
                continue
            msgs = json.loads(line)["messages"]
            prompt = tok.apply_chat_template(msgs[:-1], tokenize=False, add_generation_prompt=True)
            full = prompt + msgs[-1]["content"] + (tok.eos_token or "")
            p_ids = tok(prompt, add_special_tokens=False).input_ids
            f_ids = tok(full, add_special_tokens=False).input_ids
            if len(f_ids) <= len(p_ids) + 8:
                continue
            labels = list(f_ids)
            for i in range(min(len(p_ids), len(labels))):
                labels[i] = -100
            self.rows.append({"input_ids": f_ids, "labels": labels})
        longest = max((len(r["input_ids"]) for r in self.rows), default=0)
        print(f"[sft] {len(self.rows)} examples from {path}, longest {longest} tokens", flush=True)

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        return self.rows[i]


def collate(batch):
    width = max(len(b["input_ids"]) for b in batch)
    pad = tok.pad_token_id
    return {
        "input_ids": torch.tensor([b["input_ids"] + [pad] * (width - len(b["input_ids"])) for b in batch]),
        "attention_mask": torch.tensor([[1] * len(b["input_ids"]) + [0] * (width - len(b["input_ids"])) for b in batch]),
        "labels": torch.tensor([b["labels"] + [-100] * (width - len(b["labels"])) for b in batch]),
    }


load_args = {"dtype": torch.bfloat16}
if args.load_4bit:
    from transformers import BitsAndBytesConfig

    load_args["quantization_config"] = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
    )
model = AutoModelForCausalLM.from_pretrained(args.base_model, **load_args)
if args.lora:
    from peft import LoraConfig, get_peft_model

    # Matches the adapters trained on rented GPUs, so a checkpoint from either
    # place loads in the other.
    model = get_peft_model(
        model,
        LoraConfig(
            r=args.lora_r,
            lora_alpha=args.lora_r * 2,
            lora_dropout=0.05,
            target_modules="all-linear",
            task_type="CAUSAL_LM",
        ),
    )
    model.print_trainable_parameters()
    # Checkpointed activations enter the frozen embedding, which has no grad, so
    # the backward pass finds nothing to differentiate. Ask the input embedding
    # for grads and use the non-reentrant checkpoint; without both, a LoRA run
    # dies at step 1 with "element 0 of tensors does not require grad".
    model.enable_input_require_grads()
model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
model.config.use_cache = False

Trainer(
    model=model,
    args=TrainingArguments(
        output_dir=f"{args.out}-ckpt",
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        gradient_accumulation_steps=args.accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_steps=10,
        bf16=True,
        logging_steps=10,
        save_strategy="no",
        report_to=[],
        optim=args.optim,
        # The logits for one long document are 150k wide per token, and both
        # they and their gradient have to live at once - that is what puts an
        # 8B over a 24GB card, not the weights. The fused kernel computes the
        # loss in chunks and never materialises them.
        use_liger_kernel=True,
    ),
    train_dataset=Pairs(args.data),
    data_collator=collate,
).train()

model.config.use_cache = True
model.save_pretrained(args.out)
tok.save_pretrained(args.out)
print(f"[sft] wrote {args.out}", flush=True)
