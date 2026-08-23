"""Second-round revision: hand a draft its own lint findings and ask for a fix.

The prompts are built on the laptop by src/cli/fix-prompts.ts, which lints each
draft and renders the findings in plain English. This script only runs them.

    python train/fix_local.py --base-model Qwen/Qwen3-8B --in fix-prompts-probe \
        --out fix-probe
"""
import argparse
import json
import os
from pathlib import Path

os.environ.setdefault("VLLM_USE_FLASHINFER_SAMPLER", "0")

from vllm import LLM, SamplingParams
from vllm.lora.request import LoRARequest

SIMPLIFY_DIR = Path(__file__).parents[1]

parser = argparse.ArgumentParser()
parser.add_argument("--base-model", required=True)
parser.add_argument("--adapter", default="")
parser.add_argument("--in", dest="inp", required=True)
parser.add_argument("--out", required=True)
parser.add_argument("--max-model-len", type=int, default=16384)
parser.add_argument("--gpu-util", type=float, default=0.90)
parser.add_argument("--temperature", type=float, default=0.6)
parser.add_argument("--top-p", type=float, default=0.9)
parser.add_argument("--chunk", type=int, default=200)
parser.add_argument("--seed", type=int, default=1234)
args = parser.parse_args()

src = SIMPLIFY_DIR / "runs" / f"{args.inp}.jsonl"
out = SIMPLIFY_DIR / "runs" / f"{args.out}.jsonl"
rows = [json.loads(l) for l in open(src, encoding="utf8") if l.strip()]

llm = LLM(
    model=args.base_model,
    max_model_len=args.max_model_len,
    gpu_memory_utilization=args.gpu_util,
    enable_lora=bool(args.adapter),
    max_lora_rank=32,
    seed=args.seed,
)
tok = llm.get_tokenizer()
lora = LoRARequest("adapter", 1, args.adapter) if args.adapter else None


def render(prompt: str) -> str:
    msgs = [{"role": "user", "content": prompt}]
    try:
        return tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False)
    except Exception:
        return tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)


# Resume from whatever is already on disk, same as the sampler.
done = 0
if out.exists():
    done = sum(1 for line in open(out, encoding="utf8") if line.strip())
print(f"[fix] {len(rows)} prompts, {done} already done", flush=True)

handle = open(out, "a", encoding="utf8")
for start in range(done, len(rows), args.chunk):
    batch = rows[start : start + args.chunk]
    prompts, params = [], []
    for row in batch:
        text = render(row["prompt"])
        used = len(tok(text).input_ids)
        # The revision is about the length of the draft; leave real room for it.
        room = max(256, args.max_model_len - used - 8)
        prompts.append(text)
        params.append(SamplingParams(temperature=args.temperature, top_p=args.top_p, max_tokens=room, seed=args.seed))
    outs = llm.generate(prompts, params, lora_request=lora)
    for row, o in zip(batch, outs):
        handle.write(
            json.dumps({"id": row["id"], "source": row["source"], "draft": row["draft"], "fixed": o.outputs[0].text.strip()})
            + "\n"
        )
    handle.flush()
    print(f"[fix] {min(start + args.chunk, len(rows))}/{len(rows)} -> {out}", flush=True)

handle.close()
print(f"wrote {out}", flush=True)
