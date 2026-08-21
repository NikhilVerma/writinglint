# Held-out evaluation for the GRPO rewriter.
#
# Every technical document in runs/docs-technical went into the GRPO prompt
# file, so scoring the model there cannot tell learning apart from memorising.
# runs/docs-holdout holds documents from six repositories the run never saw.
# This job rewrites each of them once per variant — the base model plus every
# adapter named in --adapter — from one loaded copy of the weights, so the
# only difference between two columns is the adapter itself.
#
#   modal run training/simplify/train/eval_holdout.py \
#     --adapter qwen3-8b-grpo-v6/final,qwen3-8b-grpo-v6/checkpoint-250
#
# Each variant lands in its own file, scored locally where slopsift lives:
#
#   node src/cli/score.ts < runs/holdout-eval/base.jsonl
#   node src/cli/score.ts < runs/holdout-eval/final.jsonl
import json
import os
from pathlib import Path

import modal

SIMPLIFY_DIR = Path(__file__).parents[1]
# The default corpus is the six unseen repositories. SIMPLIFY_EVAL_DOCS points
# the same job at any other folder — the pull-request description that started
# this investigation gets its own one-file run.
DOCS = Path(os.environ.get("SIMPLIFY_EVAL_DOCS", SIMPLIFY_DIR / "runs" / "docs-holdout"))
OUT_DIR = Path(os.environ.get("SIMPLIFY_EVAL_OUT", SIMPLIFY_DIR / "runs" / "holdout-eval"))
GPU = os.environ.get("SIMPLIFY_EVAL_GPU", "H100")

app = modal.App("slopsift-simplify-holdout")
vol = modal.Volume.from_name("slopsift-simplify-lora", create_if_missing=True)
hf_cache = modal.Volume.from_name("slopsift-hf-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("torch", "transformers>=4.51", "peft>=0.15", "vllm")
    .env({"VLLM_USE_FLASHINFER_SAMPLER": "0"})
    .add_local_dir(DOCS, "/data/docs")
    .add_local_file(SIMPLIFY_DIR / "prompts" / "rewrite-sft-v2.md", "/data/system.md")
)


@app.function(
    image=image,
    gpu=GPU,
    timeout=2 * 3600,
    volumes={"/out": vol, "/root/.cache/huggingface": hf_cache},
)
def evaluate(
    base_model: str = "Qwen/Qwen3-8B",
    adapter: str = "qwen3-8b-grpo-v6/final",
    limit: int = 0,
    seed: int = 42,
):
    """`adapter` takes a comma-separated list. Training reward peaked at
    checkpoint-250 while faithfulness peaked at the end, so both get scored
    against the same base generations from one loaded copy of the weights."""
    import glob

    from vllm import LLM, SamplingParams
    from vllm.lora.request import LoRARequest

    system = open("/data/system.md").read().strip()
    files = sorted(glob.glob("/data/docs/*.md"))
    if limit:
        files = files[:limit]
    sources = [(Path(f).name, open(f).read().strip()) for f in files]
    print(f"[eval] {len(sources)} held-out documents", flush=True)

    llm = LLM(
        model=base_model,
        max_model_len=8192,
        gpu_memory_utilization=0.85,
        enable_lora=True,
        # The trainer used rank 32, and vLLM rejects an adapter above whatever
        # ceiling it was built with.
        max_lora_rank=32,
        seed=seed,
    )
    tokenizer = llm.get_tokenizer()
    prompts = [
        tokenizer.apply_chat_template(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": f"Simplify this:\n\n{text}"},
            ],
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
        for _, text in sources
    ]
    # Qwen3 non-thinking sampling per the model card. Greedy decoding loops on
    # this task, so the run is sampled and seeded instead. One seed per position
    # rather than one for the whole batch: a single-document run is measured by
    # duplicating that document, and a shared seed would return the same text
    # every time and hide the variance the run exists to show.
    params = [
        SamplingParams(
            temperature=0.7, top_p=0.8, top_k=20, max_tokens=2048, seed=seed + i
        )
        for i in range(len(prompts))
    ]

    variants = [("base", None)]
    for i, name in enumerate(a.strip() for a in adapter.split(",") if a.strip()):
        label = name.rsplit("/", 1)[-1]
        variants.append((label, LoRARequest(label, i + 1, f"/out/{name}")))

    results = {}
    for label, lora in variants:
        outs = llm.generate(prompts, params, lora_request=lora)
        results[label] = [
            {
                "id": name,
                "input": text,
                "output": out.outputs[0].text,
                "outputTokens": len(out.outputs[0].token_ids),
            }
            for (name, text), out in zip(sources, outs)
        ]
        print(f"[eval] {label}: {len(results[label])} rewrites", flush=True)
    return results


@app.local_entrypoint()
def main(
    base_model: str = "Qwen/Qwen3-8B",
    adapter: str = "qwen3-8b-grpo-v6/final",
    limit: int = 0,
):
    results = evaluate.remote(base_model=base_model, adapter=adapter, limit=limit)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for label, rows in results.items():
        path = OUT_DIR / f"{label}.jsonl"
        with open(path, "w") as handle:
            for row in rows:
                handle.write(json.dumps(row) + "\n")
        print(f"wrote {len(rows)} rewrites to {path}")
