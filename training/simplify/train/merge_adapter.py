# Merges a trained LoRA adapter into its base model so vLLM can serve it and
# Hugging Face can host it as a standalone model. Reads the adapter from the
# training volume and writes the merged weights back beside it.
# Run: modal run train/merge_adapter.py --run-name qwen3-4b-lora-v2-hp
import modal

app = modal.App("slopsift-simplify-merge")
vol = modal.Volume.from_name("slopsift-simplify-lora")

image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "torch",
    "transformers>=4.51",
    "peft>=0.15",
    "accelerate",
)


@app.function(image=image, timeout=1800, volumes={"/out": vol}, memory=32768)
def merge(run_name: str, base_model: str = "Qwen/Qwen3-4B"):
    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    adapter_dir = f"/out/{run_name}/final"
    merged_dir = f"/out/{run_name}/merged"

    model = AutoModelForCausalLM.from_pretrained(base_model, torch_dtype=torch.bfloat16)
    model = PeftModel.from_pretrained(model, adapter_dir)
    model = model.merge_and_unload()
    model.save_pretrained(merged_dir)
    AutoTokenizer.from_pretrained(adapter_dir).save_pretrained(merged_dir)
    vol.commit()
    return merged_dir


@app.local_entrypoint()
def main(run_name: str = "qwen3-4b-lora-v2-hp", base_model: str = "Qwen/Qwen3-4B"):
    print("merged to:", merge.remote(run_name=run_name, base_model=base_model))
