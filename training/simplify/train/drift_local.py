# The same two-pass drift benchmark as drift_modal.py, run on local hardware.
#
#   python train/drift_local.py --base-model HuggingFaceTB/SmolLM2-135M-Instruct \
#     --out-name smol135 --limit 12 --passes 1
#
# It exists because the on-device question cannot be answered on a rented H100.
# A candidate model has to prove it works on the machine it will ship to, and
# the gauntlet runs a dozen of them, so paying per model is the wrong shape.
import argparse
import json
import os
from pathlib import Path

# FlashInfer's sampler is JIT-compiled against whatever nvcc is on the box, and
# on this one the bundled cub headers do not match it. The Modal image turns it
# off for the same reason; vLLM's own sampler is fine for a benchmark.
os.environ.setdefault("VLLM_USE_FLASHINFER_SAMPLER", "0")

SIMPLIFY_DIR = Path(__file__).parents[1]

parser = argparse.ArgumentParser()
parser.add_argument("--base-model", default="Qwen/Qwen3-8B")
parser.add_argument("--adapter", default="")
parser.add_argument("--out-name", default="base")
parser.add_argument("--inputs", default=str(SIMPLIFY_DIR / "runs" / "drift-inputs-v11.jsonl"))
parser.add_argument("--system", default=str(SIMPLIFY_DIR / "prompts" / "rewrite-sft-v3.md"))
parser.add_argument("--passes", type=int, default=3)
parser.add_argument("--base-seed", type=int, default=42)
parser.add_argument("--limit", type=int, default=0)
parser.add_argument("--max-model-len", type=int, default=8192)
parser.add_argument("--gpu-util", type=float, default=0.85)
parser.add_argument("--max-tokens", type=int, default=4096)
args = parser.parse_args()

from vllm import LLM, SamplingParams
from vllm.lora.request import LoRARequest

system = Path(args.system).read_text(encoding="utf8").strip()
rows = [json.loads(l) for l in open(args.inputs, encoding="utf8") if l.strip()]
if args.limit:
    rows = rows[: args.limit]
print(f"[drift] {len(rows)} docs x {args.passes} passes, model={args.base_model}, adapter={args.adapter or 'base'}", flush=True)

llm = LLM(
    model=args.base_model,
    max_model_len=args.max_model_len,
    gpu_memory_utilization=args.gpu_util,
    enable_lora=bool(args.adapter),
    max_lora_rank=32,
    seed=args.base_seed,
)
tok = llm.get_tokenizer()
lora = LoRARequest("adapter", 1, args.adapter) if args.adapter else None


def render(text: str) -> str:
    """Small instruct models do not all accept a system turn.

    Gemma's template raises on one outright. Folding the instructions into the
    user turn keeps the same words in front of every model, so a difference in
    the scores is a difference in the model rather than in the prompt.
    """
    user = f"Simplify this:\n\n{text}"
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    try:
        return tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False)
    except Exception:
        merged = [{"role": "user", "content": f"{system}\n\n{user}"}]
        return tok.apply_chat_template(merged, tokenize=False, add_generation_prompt=True)


# A document the model cannot physically read is a failure of that model for
# this job, not a reason to quietly drop it. Record it and score it as such.
# Everything that does fit gets whatever output room is left over rather than a
# flat 4096, which is what the rented-GPU runs did and is what keeps these
# numbers comparable to the ones the 8B already has.
texts = [r["input"] for r in rows]


def room(text: str) -> int:
    used = len(tok(render(text)).input_ids)
    return min(args.max_tokens, args.max_model_len - used - 8)


overflow = [room(t) < 256 for t in texts]
if any(overflow):
    print(f"[drift] {sum(overflow)}/{len(rows)} docs do not fit the context and are left unchanged", flush=True)

out = SIMPLIFY_DIR / "runs" / f"drift-{args.out_name}.jsonl"
history = [list(texts)]
for p in range(args.passes):
    live = [i for i, over in enumerate(overflow) if not over]
    prompts = [render(texts[i]) for i in live]
    params = [
        SamplingParams(temperature=0.7, top_p=0.8, max_tokens=max(256, room(texts[i])), seed=args.base_seed + p)
        for i in live
    ]
    outs = llm.generate(prompts, params, lora_request=lora)
    nxt = list(texts)
    for i, o in zip(live, outs):
        nxt[i] = o.outputs[0].text.strip()
    texts = nxt
    history.append(list(texts))
    # Written every pass so a crash in pass 3 does not throw away passes 1 and 2.
    out.write_text(
        "".join(
            json.dumps({"id": r["id"], "passes": [h[i] for h in history], "overflow": overflow[i]}) + "\n"
            for i, r in enumerate(rows)
        ),
        encoding="utf8",
    )
    print(f"[drift] pass {p + 1} done -> {out}", flush=True)

print(f"wrote {len(rows)} rows to {out}")
