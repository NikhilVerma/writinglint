# LoRA supervised fine-tuning for the slop-simplification rewriter.
#
# Stage 1 of the mixed run. The adapter it produces is warm-started into
# train_grpo.py via --init-adapter, so the LoRA shape here MUST match the shape
# there (r=32, alpha=64, all-linear) or the warm start cannot load it.
#
#   npx tsx src/cli/sft-dataset.ts --out runs/sft-v8
#   SIMPLIFY_EXPORT_DIR=runs/sft-v8 modal run train/train_lora.py \
#     --base-model Qwen/Qwen3-8B --run-name qwen3-8b-sft-v8
import os
from pathlib import Path

import modal

# SIMPLIFY_EXPORT_DIR selects the dataset baked into the image (train.jsonl +
# holdout.jsonl); SIMPLIFY_GPU/SIMPLIFY_TIMEOUT_S size the run. All resolve at
# `modal run` time on the local side.
EXPORT_DIR = Path(
    os.environ.get(
        "SIMPLIFY_EXPORT_DIR", Path(__file__).parents[1] / "runs" / "trial-001" / "export"
    )
)
GPU = os.environ.get("SIMPLIFY_GPU", "H100")
TIMEOUT_S = int(os.environ.get("SIMPLIFY_TIMEOUT_S", 3 * 3600))

app = modal.App("slopsift-simplify-lora")
vol = modal.Volume.from_name("slopsift-simplify-lora", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "torch",
        "transformers>=4.51",
        "trl>=0.21",
        "peft>=0.15",
        "datasets",
        "accelerate",
    )
    .add_local_file(EXPORT_DIR / "train.jsonl", "/data/train.jsonl")
    .add_local_file(EXPORT_DIR / "holdout.jsonl", "/data/holdout.jsonl")
)


# Set to cover the corpus, not to save memory. Rows carry the source in the
# prompt and the full rewrite in the completion, and the longest is 11,224
# tokens; 12288 clears it with room to spare and drops nothing.
#
# Raising this is close to free here. Batches are one row with dynamic padding,
# so the cap truncates rather than pads — short rows never pay for it. A lower
# cap would silently cut the long documents, and those are the only ones that
# teach the model to leave a long clean document alone.
MAX_LENGTH = 12288


@app.function(image=image, gpu=GPU, timeout=TIMEOUT_S, volumes={"/out": vol})
def train(
    base_model: str = "Qwen/Qwen3-8B",
    run_name: str = "qwen3-8b-sft-v8",
    epochs: int = 2,
    lr: float = 1e-4,
):
    import glob

    from datasets import load_dataset
    from peft import LoraConfig
    from transformers import TrainerCallback
    from trl import SFTConfig, SFTTrainer

    ds = load_dataset(
        "json", data_files={"train": "/data/train.jsonl", "eval": "/data/holdout.jsonl"}
    )
    # sft-dataset.ts carries sourceId and kind for auditing; TRL wants messages
    # only.
    ds = ds.remove_columns(
        [c for c in ds["train"].column_names if c != "messages"]
    )
    # Prompt-completion format so TRL computes loss on the completion only.
    # With plain "messages" rows TRL trains on the full sequence, and the
    # original document inside the user turn then dominates the gradient —
    # the v1 adapter learned to copy its input because of exactly that.
    ds = ds.map(
        lambda row: {"prompt": row["messages"][:-1], "completion": row["messages"][-1:]},
        remove_columns=["messages"],
    )

    # Drop what will not fit instead of letting TRL truncate it. A truncated
    # self-target row ends mid-document, which teaches the model to stop early
    # on long text — the exact habit this stage exists to remove. At the current
    # cap nothing is dropped; this stays as a guard so a future corpus with
    # longer documents fails loudly in the log instead of quietly mid-sentence.
    from transformers import AutoTokenizer

    tok = AutoTokenizer.from_pretrained(base_model)

    def fits(row):
        text = tok.apply_chat_template(
            row["prompt"] + row["completion"], tokenize=False
        )
        return len(tok(text)["input_ids"]) <= MAX_LENGTH

    for split in ds:
        before = len(ds[split])
        ds[split] = ds[split].filter(fits)
        dropped = before - len(ds[split])
        print(
            f"[data] {split}: {len(ds[split])} rows, dropped {dropped} over {MAX_LENGTH} tokens",
            flush=True,
        )

    # Must match train_grpo.py exactly. GRPO warm-starts from this adapter with
    # PeftModel.from_pretrained, which cannot reshape a rank-16 adapter into the
    # rank-32 one the GRPO run expects.
    peft_config = LoraConfig(
        r=32,
        lora_alpha=64,
        lora_dropout=0.05,
        target_modules="all-linear",
        task_type="CAUSAL_LM",
    )
    cfg = SFTConfig(
        output_dir=f"/out/{run_name}",
        num_train_epochs=epochs,
        learning_rate=lr,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        max_length=MAX_LENGTH,
        bf16=True,
        gradient_checkpointing=True,
        logging_steps=5,
        eval_strategy="epoch",
        # Checkpoints must reach the volume as they land: Modal preempts GPU
        # workers, and an uncommitted checkpoint dies with the worker.
        save_strategy="steps",
        save_steps=100,
        save_total_limit=2,
        report_to=[],
        seed=42,
        model_init_kwargs={"torch_dtype": "bfloat16"},
    )
    class CommitOnSave(TrainerCallback):
        def on_save(self, args, state, control, **kwargs):
            vol.commit()

    trainer = SFTTrainer(
        model=base_model,
        args=cfg,
        train_dataset=ds["train"],
        eval_dataset=ds["eval"],
        peft_config=peft_config,
        callbacks=[CommitOnSave()],
    )
    checkpoints = sorted(
        glob.glob(f"/out/{run_name}/checkpoint-*"),
        key=lambda p: int(p.rsplit("-", 1)[-1]),
    )
    trainer.train(resume_from_checkpoint=checkpoints[-1] if checkpoints else None)
    metrics = trainer.evaluate()
    trainer.save_model(f"/out/{run_name}/final")
    trainer.processing_class.save_pretrained(f"/out/{run_name}/final")
    vol.commit()
    return metrics


@app.local_entrypoint()
def main(
    base_model: str = "Qwen/Qwen3-8B",
    run_name: str = "qwen3-8b-sft-v8",
    epochs: int = 2,
    lr: float = 1e-4,
):
    metrics = train.remote(
        base_model=base_model, run_name=run_name, epochs=epochs, lr=lr
    )
    print("eval metrics:", metrics)
