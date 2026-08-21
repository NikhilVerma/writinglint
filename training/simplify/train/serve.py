# Serves the merged simplifier over an OpenAI-compatible HTTP API so the
# playground (and any OpenAI client) can talk to it. The container sleeps when
# idle, so a deployed endpoint costs nothing between conversations.
#   modal secret create slopsift-simplify-key VLLM_API_KEY=<token>
#   modal deploy train/serve.py          # stable URL
#   modal serve train/serve.py           # temporary URL, reloads on edit
import os

import modal

BASE_MODEL = os.environ.get("SIMPLIFY_BASE_MODEL", "Qwen/Qwen3-8B")
# An L4 holds the 4B weights but leaves the 8B almost no room for a KV
# cache, so the default moved up with the model.
GPU = os.environ.get("SIMPLIFY_SERVE_GPU", "L40S")
# Serving the base weights plus both adapters lets one endpoint answer the
# only question that matters: does either fine-tune beat the untrained model
# on the same input? Pick between them with the request's `model` field.
ADAPTERS = {
    "grpo": "/out/qwen3-8b-grpo-v6/final",
    "grpo-450": "/out/qwen3-8b-grpo-v6/checkpoint-450",
}

app = modal.App("slopsift-simplify-serve")
vol = modal.Volume.from_name("slopsift-simplify-lora")
# Keeps the base weights across cold starts instead of refetching 8 GB.
hf_cache = modal.Volume.from_name("slopsift-hf-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("vllm", "huggingface_hub")
    # FlashInfer's sampler compiles a CUDA kernel on first use, and this image
    # ships no nvcc. Fall back to the PyTorch sampler instead.
    .env({"VLLM_USE_FLASHINFER_SAMPLER": "0"})
)


@app.function(
    image=image,
    gpu=GPU,
    volumes={"/out": vol, "/root/.cache/huggingface": hf_cache},
    secrets=[modal.Secret.from_name("slopsift-simplify-key")],
    # Idle containers shut down after five minutes; a cold start reloads the
    # weights and takes a couple of minutes.
    scaledown_window=300,
    timeout=3600,
)
@modal.concurrent(max_inputs=8)
@modal.web_server(port=8000, startup_timeout=900)
def serve():
    import subprocess

    subprocess.Popen(
        [
            "vllm",
            "serve",
            BASE_MODEL,
            "--served-model-name",
            "base",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
            "--api-key",
            os.environ["VLLM_API_KEY"],
            "--max-model-len",
            "8192",
            "--enable-lora",
            "--max-lora-rank",
            "32",
            "--max-loras",
            "2",
            "--lora-modules",
            *[f"{name}={path}" for name, path in ADAPTERS.items()],
            # The playground page runs from localhost, so it needs CORS.
            "--allowed-origins",
            '["*"]',
        ]
    )
