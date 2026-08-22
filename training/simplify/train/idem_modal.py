# Runs the idempotence benchmark inside Modal instead of against a served
# endpoint, so scoring an adapter needs no deployment and no API key.
#
# The inputs are read verbatim from a frozen baseline file, which is what makes
# the result comparable: v8 sees the same 120 documents, the same k draws, and
# the same per-draw seed that base and v7 saw. Generation only happens here;
# scoring stays local where slopsift lives.
#
#   modal run train/idem_modal.py --adapter qwen3-8b-sft-v8/final --out-name sft-v8
#   npx tsx src/cli/score.ts < runs/idem-sft-v8.jsonl > runs/idem-sft-v8.scored.jsonl
import json
import os
from pathlib import Path

import modal

SIMPLIFY_DIR = Path(__file__).parents[1]
# Any frozen arm works as the input source; they all carry identical inputs.
FROZEN = Path(os.environ.get("SIMPLIFY_IDEM_INPUT", SIMPLIFY_DIR / "runs" / "idem-base.jsonl"))
GPU = os.environ.get("SIMPLIFY_IDEM_GPU", "H100")

app = modal.App("slopsift-simplify-idem")
vol = modal.Volume.from_name("slopsift-simplify-lora")
hf_cache = modal.Volume.from_name("slopsift-hf-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("torch", "transformers>=4.51", "peft>=0.15", "vllm")
    .env({"VLLM_USE_FLASHINFER_SAMPLER": "0"})
    .add_local_file(FROZEN, "/data/frozen.jsonl")
    .add_local_file(SIMPLIFY_DIR / "prompts" / "rewrite-sft-v2.md", "/data/system.md")
)


@app.function(
    image=image,
    gpu=GPU,
    timeout=2 * 3600,
    volumes={"/out": vol, "/root/.cache/huggingface": hf_cache},
)
def run(base_model: str = "Qwen/Qwen3-8B", adapter: str = "", base_seed: int = 42):
    from vllm import LLM, SamplingParams
    from vllm.lora.request import LoRARequest

    system = open("/data/system.md").read().strip()
    rows = [json.loads(l) for l in open("/data/frozen.jsonl") if l.strip()]
    print(f"[idem] {len(rows)} rows, adapter={adapter or 'base'}", flush=True)

    llm = LLM(
        model=base_model,
        max_model_len=8192,
        gpu_memory_utilization=0.85,
        enable_lora=bool(adapter),
        # The trainer used rank 32; vLLM rejects an adapter above its ceiling.
        max_lora_rank=32,
        seed=base_seed,
    )
    tok = llm.get_tokenizer()
    prompts = [
        tok.apply_chat_template(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": f"Simplify this:\n\n{r['input']}"},
            ],
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
        for r in rows
    ]
    # Seed per draw, matching src/cli/idempotence.ts exactly: the trailing
    # "#<sample>" on the id selects the draw, and the seed is base + sample.
    params = [
        SamplingParams(
            temperature=0.7,
            top_p=0.8,
            max_tokens=4096,
            seed=base_seed + int(r["id"].rsplit("#", 1)[1]),
        )
        for r in rows
    ]
    lora = LoRARequest("adapter", 1, f"/out/{adapter}") if adapter else None
    outs = llm.generate(prompts, params, lora_request=lora)
    return [
        {"id": r["id"], "input": r["input"], "output": o.outputs[0].text.strip()}
        for r, o in zip(rows, outs)
    ]


@app.local_entrypoint()
def main(adapter: str = "qwen3-8b-sft-v8/final", out_name: str = "sft-v8", base_seed: int = 42):
    rows = run.remote(adapter=adapter, base_seed=base_seed)
    out = SIMPLIFY_DIR / "runs" / f"idem-{out_name}.jsonl"
    out.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf8")
    print(f"wrote {len(rows)} rows to {out}")
