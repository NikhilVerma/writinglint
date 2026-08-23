# Two-pass drift benchmark: the real question is not what the model does to a
# document once, but whether its own output is a fixed point.
#
#   pass 1   dirty input X  -> Y1   (expected to change a lot)
#   pass 2   Y1             -> Y2   (should change almost nothing)
#
# Drift is measured as 1 - echoRate between consecutive passes, so "changed 20%
# of the phrasing" reads directly. A model that is idempotent on its own output
# has a large pass-1 change and a small pass-2 change.
#
#   modal run train/drift_modal.py --adapter qwen3-8b-grpo-v7/checkpoint-450 --out-name v7
import json
import os
from pathlib import Path

import modal

SIMPLIFY_DIR = Path(__file__).parents[1]
INPUTS = Path(os.environ.get("SIMPLIFY_DRIFT_INPUT", SIMPLIFY_DIR / "runs" / "idem-corrupt-inputs.jsonl"))
GPU = os.environ.get("SIMPLIFY_DRIFT_GPU", "H100")

app = modal.App("slopsift-simplify-drift")
vol = modal.Volume.from_name("slopsift-simplify-lora")
hf_cache = modal.Volume.from_name("slopsift-hf-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("torch", "transformers>=4.51", "peft>=0.15", "vllm")
    .env({"VLLM_USE_FLASHINFER_SAMPLER": "0"})
    .add_local_file(INPUTS, "/data/inputs.jsonl")
    .add_local_file(SIMPLIFY_DIR / "prompts" / "rewrite-sft-v3.md", "/data/system.md")
)


@app.function(
    image=image,
    gpu=GPU,
    timeout=3 * 3600,
    volumes={"/out": vol, "/root/.cache/huggingface": hf_cache},
)
def run(base_model: str = "Qwen/Qwen3-8B", adapter: str = "", base_seed: int = 42, passes: int = 3):
    from vllm import LLM, SamplingParams
    from vllm.lora.request import LoRARequest

    system = open("/data/system.md").read().strip()
    rows = [json.loads(l) for l in open("/data/inputs.jsonl") if l.strip()]
    print(f"[drift] {len(rows)} docs x {passes} passes, adapter={adapter or 'base'}", flush=True)

    llm = LLM(
        model=base_model,
        max_model_len=8192,
        gpu_memory_utilization=0.85,
        enable_lora=bool(adapter),
        max_lora_rank=32,
        seed=base_seed,
    )
    tok = llm.get_tokenizer()
    lora = LoRARequest("adapter", 1, f"/out/{adapter}") if adapter else None

    texts = [r["input"] for r in rows]
    history = [list(texts)]
    for p in range(passes):
        prompts = [
            tok.apply_chat_template(
                [
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"Simplify this:\n\n{t}"},
                ],
                tokenize=False,
                add_generation_prompt=True,
                enable_thinking=False,
            )
            for t in texts
        ]
        # A different seed per pass, so a small pass-2 drift means the model is
        # genuinely stable rather than replaying one fixed sampling path.
        params = SamplingParams(temperature=0.7, top_p=0.8, max_tokens=4096, seed=base_seed + p)
        outs = llm.generate(prompts, params, lora_request=lora)
        texts = [o.outputs[0].text.strip() for o in outs]
        history.append(list(texts))
        print(f"[drift] pass {p + 1} done", flush=True)

    return [
        {"id": r["id"], "passes": [h[i] for h in history]}
        for i, r in enumerate(rows)
    ]


@app.local_entrypoint()
def main(adapter: str = "", out_name: str = "base", base_seed: int = 42, passes: int = 3):
    rows = run.remote(adapter=adapter, base_seed=base_seed, passes=passes)
    out = SIMPLIFY_DIR / "runs" / f"drift-{out_name}.jsonl"
    out.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf8")
    print(f"wrote {len(rows)} rows to {out}")
