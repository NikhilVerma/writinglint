"""Draw n rewrites per document, so the good ones can be kept and the rest thrown away.

Distillation assumed a teacher better than the student. The size ladder killed
that assumption: on this benchmark a 1.7B matches the 8B, so there is nothing
above to copy from. What is still true is that a model's BEST sample beats its
average one by a wide margin, and the linter can tell which is which. Sampling
wide and keeping only what actually cleaned turns one model into its own
teacher.

    python train/sample_n.py --base-model Qwen/Qwen3-8B --n 8 --out samples-8b
"""
import argparse
import json
import os
from pathlib import Path

os.environ.setdefault("VLLM_USE_FLASHINFER_SAMPLER", "0")

SIMPLIFY_DIR = Path(__file__).parents[1]

parser = argparse.ArgumentParser()
parser.add_argument("--base-model", default="Qwen/Qwen3-8B")
parser.add_argument("--adapter", default="")
parser.add_argument("--prompts", default=str(SIMPLIFY_DIR / "runs" / "grpo" / "prompts-v13.jsonl"))
parser.add_argument("--out", default="samples")
parser.add_argument("--n", type=int, default=8)
parser.add_argument("--limit", type=int, default=0)
parser.add_argument("--temperature", type=float, default=0.9)
parser.add_argument("--top-p", type=float, default=0.95)
parser.add_argument("--max-model-len", type=int, default=8192)
parser.add_argument("--max-tokens", type=int, default=4096)
parser.add_argument("--gpu-util", type=float, default=0.85)
parser.add_argument("--chunk", type=int, default=200)
args = parser.parse_args()

from vllm import LLM, SamplingParams
from vllm.lora.request import LoRARequest

rows = [json.loads(l) for l in open(args.prompts, encoding="utf8") if l.strip()]
if args.limit:
    rows = rows[: args.limit]
print(f"[sample] {len(rows)} docs x {args.n} samples, model={args.base_model}", flush=True)

llm = LLM(
    model=args.base_model,
    max_model_len=args.max_model_len,
    gpu_memory_utilization=args.gpu_util,
    enable_lora=bool(args.adapter),
    max_lora_rank=32,
    seed=42,
)
tok = llm.get_tokenizer()
lora = LoRARequest("adapter", 1, args.adapter) if args.adapter else None

out = SIMPLIFY_DIR / "runs" / f"{args.out}.jsonl"
# Written per chunk: a run this long should never lose everything to a crash at
# the end, and a partial file is still usable training data.
done = 0
if out.exists():
    done = sum(1 for line in open(out, encoding="utf8") if line.strip())
    print(f"[sample] resuming after {done} docs already written", flush=True)
handle = open(out, "a", encoding="utf8")

for start in range(done, len(rows), args.chunk):
    batch = rows[start : start + args.chunk]
    prompts, params = [], []
    for row in batch:
        text = tok.apply_chat_template(row["prompt"], tokenize=False, add_generation_prompt=True, enable_thinking=False)
        room = args.max_model_len - len(tok(text).input_ids) - 8
        prompts.append(text)
        params.append(
            SamplingParams(
                n=args.n,
                temperature=args.temperature,
                top_p=args.top_p,
                max_tokens=max(256, min(args.max_tokens, room)),
            )
        )
    outs = llm.generate(prompts, params, lora_request=lora)
    for row, o in zip(batch, outs):
        handle.write(json.dumps({"source": row["source"], "outputs": [c.text.strip() for c in o.outputs]}) + "\n")
    handle.flush()
    print(f"[sample] {min(start + args.chunk, len(rows))}/{len(rows)} -> {out}", flush=True)

handle.close()
print(f"[sample] done {out}", flush=True)
