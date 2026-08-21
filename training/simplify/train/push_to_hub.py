# Publishes the merged simplifier to the Hugging Face Hub. Uploads straight
# from the Modal volume, so the weights never travel through the laptop.
# The private training corpus is never uploaded: only weights, tokenizer, and
# the model card you pass in.
#   modal secret create huggingface-token HF_TOKEN=<write token>
#   modal run train/push_to_hub.py --repo-id <user>/<model> [--private]
from pathlib import Path

import modal

CARD_PATH = Path(__file__).parents[1] / "train" / "MODEL_CARD.md"

app = modal.App("slopsift-simplify-push")
vol = modal.Volume.from_name("slopsift-simplify-lora")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("huggingface_hub")
    .add_local_file(CARD_PATH, "/card/README.md")
)


@app.function(
    image=image,
    timeout=3600,
    volumes={"/out": vol},
    secrets=[modal.Secret.from_name("huggingface-token")],
)
def push(repo_id: str, run_name: str, private: bool = True, adapter_only: bool = False):
    import os
    import shutil

    from huggingface_hub import HfApi

    src = f"/out/{run_name}/{'final' if adapter_only else 'merged'}"
    shutil.copyfile("/card/README.md", f"{src}/README.md")

    api = HfApi(token=os.environ["HF_TOKEN"])
    api.create_repo(repo_id=repo_id, private=private, exist_ok=True)
    api.upload_folder(
        repo_id=repo_id,
        folder_path=src,
        # Optimizer and scheduler state are training leftovers, not weights.
        ignore_patterns=["optimizer.pt", "scheduler.pt", "rng_state.pth", "trainer_state.json"],
    )
    return f"https://huggingface.co/{repo_id}"


@app.local_entrypoint()
def main(
    repo_id: str,
    run_name: str = "qwen3-4b-lora-v2-hp",
    private: bool = True,
    adapter_only: bool = False,
):
    print("published:", push.remote(repo_id=repo_id, run_name=run_name, private=private, adapter_only=adapter_only))
