# LoRA supervised fine-tuning for the slop-simplification rewriter (TODO Phase 4).
# Trains Qwen/Qwen3-1.7B on the exported accepted pairs; holdout families are
# eval-only. Run: modal run training/simplify/train/train_lora.py
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
GPU = os.environ.get("SIMPLIFY_GPU", "L4")
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


@app.function(image=image, gpu=GPU, timeout=TIMEOUT_S, volumes={"/out": vol})
def train(
    base_model: str = "Qwen/Qwen3-1.7B",
    run_name: str = "qwen3-1p7b-lora-v1",
    epochs: int = 4,
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

    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
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
        max_length=6144,
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
    base_model: str = "Qwen/Qwen3-1.7B",
    run_name: str = "qwen3-1p7b-lora-v1",
    epochs: int = 4,
    lr: float = 1e-4,
):
    metrics = train.remote(
        base_model=base_model, run_name=run_name, epochs=epochs, lr=lr
    )
    print("eval metrics:", metrics)
