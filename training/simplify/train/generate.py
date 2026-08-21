# Holdout inference for the eval harness (TODO Phase 4).
# Generates rewrites for the 16 held-out prompts with the base model or a
# trained adapter from the slopsift-simplify-lora volume, then writes them
# locally for src/cli/evaluate.ts to score.
#
#   modal run training/simplify/train/generate.py --label base
#   modal run training/simplify/train/generate.py --label adapter \
#     --adapter qwen3-1p7b-lora-v1/final
from pathlib import Path

import modal

EXPORT_DIR = Path(__file__).parents[1] / "runs" / "trial-001" / "export"
EVAL_DIR = Path(__file__).parents[1] / "runs" / "trial-001" / "eval"

app = modal.App("slopsift-simplify-generate")
vol = modal.Volume.from_name("slopsift-simplify-lora", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "torch",
        "transformers>=4.51",
        "peft>=0.15",
        "accelerate",
    )
    .add_local_file(EXPORT_DIR / "holdout.jsonl", "/data/holdout.jsonl")
)


@app.function(image=image, gpu="L4", timeout=2 * 3600, volumes={"/out": vol})
def generate(
    base_model: str = "Qwen/Qwen3-1.7B",
    adapter: str = "",
    max_new_tokens: int = 4096,
    seed: int = 42,
):
    import json

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    torch.manual_seed(seed)
    tokenizer = AutoTokenizer.from_pretrained(base_model)
    model = AutoModelForCausalLM.from_pretrained(
        base_model, torch_dtype=torch.bfloat16, device_map="cuda"
    )
    if adapter:
        from peft import PeftModel

        model = PeftModel.from_pretrained(model, f"/out/{adapter}")
    model.eval()

    with open("/data/holdout.jsonl") as f:
        rows = [json.loads(line) for line in f]

    results = []
    for row in rows:
        # System + user turn exactly as trained; the assistant turn is the
        # pipeline reference and must not leak into the prompt.
        prompt_messages = row["messages"][:2]
        text = tokenizer.apply_chat_template(
            prompt_messages,
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
        inputs = tokenizer(text, return_tensors="pt").to("cuda")
        # Qwen3 non-thinking sampling per model card; greedy decoding loops.
        # A fixed seed keeps runs reproducible on the same hardware.
        with torch.no_grad():
            out = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=True,
                temperature=0.7,
                top_p=0.8,
                top_k=20,
            )
        new_tokens = out[0][inputs["input_ids"].shape[1] :]
        results.append(
            {
                "sourceId": row["sourceId"],
                "promptId": row["promptId"],
                "baseModel": base_model,
                "adapter": adapter or None,
                "inputTokens": int(inputs["input_ids"].shape[1]),
                "outputTokens": int(new_tokens.shape[0]),
                "output": tokenizer.decode(new_tokens, skip_special_tokens=True),
            }
        )
        print(
            f"{row['sourceId']}: {inputs['input_ids'].shape[1]} in -> "
            f"{new_tokens.shape[0]} out",
            flush=True,
        )
    return results


@app.local_entrypoint()
def main(
    label: str = "base",
    adapter: str = "",
    base_model: str = "Qwen/Qwen3-1.7B",
    max_new_tokens: int = 4096,
):
    import json

    rows = generate.remote(
        base_model=base_model, adapter=adapter, max_new_tokens=max_new_tokens
    )
    EVAL_DIR.mkdir(parents=True, exist_ok=True)
    out_path = EVAL_DIR / f"gen-{label}.jsonl"
    with open(out_path, "w") as f:
        for row in rows:
            f.write(json.dumps(row) + "\n")
    print(f"wrote {len(rows)} generations to {out_path}")
