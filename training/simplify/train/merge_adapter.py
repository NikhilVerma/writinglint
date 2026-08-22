# Merges a trained LoRA adapter into its base model so vLLM can serve it and
# Hugging Face can host it as a standalone model. Reads the adapter from the
# training volume and writes the merged weights back beside it.
#
#   modal run train/merge_adapter.py --run-name qwen3-8b-sft-v8
#   modal run train/merge_adapter.py --run-name qwen3-8b-grpo-v8 --step 300
import modal

app = modal.App("slopsift-simplify-merge")
vol = modal.Volume.from_name("slopsift-simplify-lora")

image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "torch",
    "transformers>=4.51",
    "peft>=0.15",
    "accelerate",
)


@app.function(image=image, timeout=1800, volumes={"/out": vol}, memory=65536)
def merge(run_name: str, step: int = 0, base_model: str = ""):
    import json
    import os

    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    # `final` is the end of a completed run; a step picks an intermediate
    # checkpoint, which is how a run that was stopped early still ships.
    sub = f"checkpoint-{step}" if step else "final"
    adapter_dir = f"/out/{run_name}/{sub}"
    merged_dir = f"/out/{run_name}/merged-{sub}"
    if not os.path.isdir(adapter_dir):
        have = sorted(os.listdir(f"/out/{run_name}"))
        raise SystemExit(f"no {adapter_dir}; run has: {have}")

    # Default the base to whatever the adapter was trained on. Passing it by
    # hand is how you merge an 8B adapter into a 4B base and get either a loud
    # shape error or, worse, a model that loads and writes nonsense.
    if not base_model:
        cfg = json.load(open(f"{adapter_dir}/adapter_config.json"))
        base_model = cfg["base_model_name_or_path"]
    print(f"[merge] {adapter_dir} into {base_model}", flush=True)

    model = AutoModelForCausalLM.from_pretrained(base_model, torch_dtype=torch.bfloat16)
    model = PeftModel.from_pretrained(model, adapter_dir)
    model = model.merge_and_unload()
    model.save_pretrained(merged_dir)
    # The trainer usually saves a tokenizer beside the adapter, but a raw
    # checkpoint may not have one; the base always does.
    src = adapter_dir if os.path.exists(f"{adapter_dir}/tokenizer_config.json") else base_model
    AutoTokenizer.from_pretrained(src).save_pretrained(merged_dir)
    vol.commit()
    return merged_dir


@app.local_entrypoint()
def main(run_name: str = "qwen3-8b-sft-v8", step: int = 0, base_model: str = ""):
    print("merged to:", merge.remote(run_name=run_name, step=step, base_model=base_model))
