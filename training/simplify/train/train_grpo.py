# GRPO for the slop-simplification rewriter.
#
# Supervised fine-tuning could only ever reward the target it was shown, which
# is why the v2 adapter copied its input whenever it could not reword it: the
# copy satisfied every constraint SFT taught it. GRPO scores whole rollouts
# instead, against a reward that pays for removing lint findings, keeps every
# fact anchored, and pays nothing at all for a verbatim copy.
#
# The reward is not reimplemented here. Each step shells out to
# src/cli/score.ts, so slopsift stays the single source of lint truth and the
# eval harness and the trainer can never drift apart.
#
#   modal run training/simplify/train/train_grpo.py
import json
import os
import subprocess
import tempfile
from pathlib import Path

import modal

SIMPLIFY_DIR = Path(__file__).parents[1]
PROMPTS = Path(
    os.environ.get("SIMPLIFY_GRPO_PROMPTS", SIMPLIFY_DIR / "runs" / "grpo" / "prompts.jsonl")
)
GPU = os.environ.get("SIMPLIFY_GRPO_GPU", "H100:2")
TIMEOUT_S = int(os.environ.get("SIMPLIFY_GRPO_TIMEOUT_S", 8 * 3600))
# Pinned, not "latest". The reward's human band is p10-p75 of human prose as
# measured by ONE version of these rules, so floating the version silently
# redefines the target the model is trained against. 0.9.0 also requires Node
# 24 while this image ships Node 22, so "latest" would have installed a
# slopsift that cannot run — and score_batch turns a dead scorer into a batch
# of zero rewards rather than a crash, so the run would have trained on
# nothing for 500 steps without ever saying so.
SLOPSIFT_VERSION = os.environ.get("SIMPLIFY_SLOPSIFT_VERSION", "0.8.2")

app = modal.App("slopsift-simplify-grpo")
vol = modal.Volume.from_name("slopsift-simplify-lora", create_if_missing=True)
hf_cache = modal.Volume.from_name("slopsift-hf-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("curl", "ca-certificates")
    # Node runs the reward scorer directly off the TypeScript sources: Node 22+
    # strips types natively, so the image needs no build step and no
    # node_modules for our own code.
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
        f"npm install -g slopsift@{SLOPSIFT_VERSION}",
    )
    .pip_install(
        "torch",
        "transformers>=4.51",
        "trl>=0.21",
        "peft>=0.15",
        "datasets",
        "accelerate",
        "vllm",
    )
    .env({
        "VLLM_USE_FLASHINFER_SAMPLER": "0",
        # Long rollouts leave the allocator badly fragmented between steps.
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
    })
    .add_local_file(PROMPTS, "/data/prompts.jsonl")
    .add_local_dir(SIMPLIFY_DIR / "src", "/simplify/src")
    .add_local_file(SIMPLIFY_DIR / "config.json", "/simplify/config.json")
)


def score_batch(rows: list[dict]) -> list[dict]:
    """Score a whole rollout batch in one Node process.

    Falls back to a zero reward for the batch rather than killing the run: a
    step that scores nothing wastes a step, while a crash wastes the job.
    """
    with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as handle:
        for row in rows:
            handle.write(json.dumps(row) + "\n")
        path = handle.name
    try:
        with open(path) as stdin:
            done = subprocess.run(
                ["node", "/simplify/src/cli/score.ts"],
                stdin=stdin,
                capture_output=True,
                text=True,
                timeout=600,
                cwd="/simplify",
            )
        if done.returncode != 0:
            print(f"[reward] scorer exited {done.returncode}: {done.stderr[:500]}")
            return [{"reward": 0.0} for _ in rows]
        scored = [json.loads(line) for line in done.stdout.splitlines() if line.strip()]
        if len(scored) != len(rows):
            print(f"[reward] expected {len(rows)} scores, got {len(scored)}")
            return [{"reward": 0.0} for _ in rows]
        return scored
    except Exception as error:  # noqa: BLE001 - a bad batch must not end the run
        print(f"[reward] scoring failed: {error}")
        return [{"reward": 0.0} for _ in rows]
    finally:
        os.unlink(path)


@app.function(
    image=image,
    gpu=GPU,
    timeout=TIMEOUT_S,
    volumes={"/out": vol, "/root/.cache/huggingface": hf_cache},
    # v6 was killed at step 146 by a cancellation signal, not by anything in
    # the training loop. The function already resumes from the newest
    # checkpoint on entry, so a retry costs at most the 25 steps since the
    # last save instead of the whole run.
    retries=modal.Retries(max_retries=5, initial_delay=30.0),
)
def train(
    base_model: str = "Qwen/Qwen3-8B",
    run_name: str = "qwen3-8b-grpo-v1",
    steps: int = 500,
    lr: float = 1e-5,
    num_generations: int = 8,
    init_adapter: str = "",
):
    import glob

    import torch
    from datasets import Dataset
    from peft import LoraConfig, PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer, TrainerCallback
    from trl import GRPOConfig, GRPOTrainer

    # Read the file directly rather than through load_dataset. Its parsed-arrow
    # cache lives in the Hugging Face cache, which this job mounts as a
    # persistent volume, so a rebuilt prompt file kept replaying the first
    # build the volume ever saw.
    with open("/data/prompts.jsonl") as handle:
        prompts = [json.loads(line) for line in handle if line.strip()]
    # A word cap does not bound tokens: a page of file paths like
    # "librocblas.so -> libamdhip64.so.7" costs several tokens per word and
    # blew past the context window at step 75. Measure the real thing.
    tokenizer = AutoTokenizer.from_pretrained(base_model)
    budget = 8192 - 2048 - 256
    def prompt_tokens(row):
        return len(
            tokenizer.apply_chat_template(
                row["prompt"], tokenize=True, add_generation_prompt=True, enable_thinking=False
            )
        )
    sized = [(row, prompt_tokens(row)) for row in prompts]
    oversized = [n for _, n in sized if n > budget]
    prompts = [row for row, n in sized if n <= budget]
    print(
        f"[data] dropped {len(oversized)} prompts over {budget} tokens "
        f"(largest {max(oversized) if oversized else 0}), {len(prompts)} remain",
        flush=True,
    )
    ds = Dataset.from_list(prompts)
    words = sorted(len(row["source"].split()) for row in prompts)
    print(
        f"[data] {len(prompts)} prompts, source words "
        f"p10 {words[len(words) // 10]} p50 {words[len(words) // 2]} "
        f"p90 {words[len(words) * 9 // 10]} max {words[-1]}",
        flush=True,
    )

    log_path = f"/out/{run_name}/reward-log.jsonl"
    Path(log_path).parent.mkdir(parents=True, exist_ok=True)

    # Prove the scorer works before training on it. score_batch deliberately
    # swallows failures so one bad batch cannot kill a long run, which means a
    # scorer broken from the start reads as "every rollout earned zero" —
    # indistinguishable from a policy that is merely terrible. Two texts of
    # obviously different quality must score differently, or stop.
    probe_src = prompts[0]["source"]
    probe = score_batch([{"id": "probe", "input": probe_src, "output": probe_src}])[0]
    print(f"[preflight] scorer returned {probe}", flush=True)
    # score.ts emits the full term breakdown on success and {id, reward, error}
    # on failure, so a missing `lint` key means the scorer never ran. Checking
    # the reward value instead would be useless: a verbatim copy legitimately
    # scores zero, which is exactly what a dead scorer also returns.
    if "lint" not in probe:
        raise RuntimeError(f"reward scorer failed; refusing to train. Got {probe}")
    # And a source with no priced findings at all means slopsift ran but nothing
    # it reported survived config.reward.scoredRules — a rulepack name typo, or
    # a slopsift whose JSON no longer carries ruleId. Either way the lint term
    # would be a constant and the run would teach nothing.
    if float(probe.get("sourceFindingsPer1kWords", 0)) <= 0:
        raise RuntimeError(
            f"scorer priced zero findings on real slop; check reward.scoredRules "
            f"against this slopsift's rule ids. Got {probe}"
        )
    print("[preflight] scorer healthy", flush=True)

    def reward_simplification(completions, source, **kwargs) -> list[float]:
        """TRL passes the dataset's `source` column through untouched, which is
        what the scorer compares each rollout against."""
        texts = [c[0]["content"] if isinstance(c, list) else c for c in completions]
        rows = [
            {"id": str(i), "input": src, "output": text}
            for i, (src, text) in enumerate(zip(source, texts))
        ]
        thinking = sum(1 for t in texts if "<think>" in t or "</think>" in t)
        scored = score_batch(rows)
        with open(log_path, "a") as handle:
            for row in scored:
                handle.write(json.dumps(row) + "\n")
        rewards = [float(row.get("reward", 0.0)) for row in scored]
        # One line per batch so a detached run shows the reward moving without
        # having to fetch the volume.
        echoes = [float(row.get("echoRate", 0.0)) for row in scored]
        kept = [float(row.get("anchorKeptRate", 0.0)) for row in scored]
        mean = lambda xs: sum(xs) / len(xs) if xs else 0.0
        print(
            f"[reward] n={len(rewards)} mean={mean(rewards):.3f} "
            f"max={max(rewards, default=0):.3f} echo={mean(echoes):.2f} "
            f"kept={mean(kept):.2f} zeros={sum(1 for r in rewards if r == 0)} "
            f"thinking={thinking}",
            flush=True,
        )
        return rewards

    peft_config = LoraConfig(
        r=32,
        lora_alpha=64,
        # Dropout injects noise into a gradient that is already noisy, and a
        # policy-gradient step carries about one bit. The published LoRA-RL
        # recipe turns it off.
        lora_dropout=0.0,
        target_modules="all-linear",
        task_type="CAUSAL_LM",
    )
    cfg = GRPOConfig(
        output_dir=f"/out/{run_name}",
        max_steps=steps,
        # LoRA needs about ten times the learning rate of a full fine-tune:
        # the 1/r scaling shrinks each update, so 1e-6 moved nothing. The last
        # run held a KL of 0.0005 and clipped 0.3% of tokens across 111 steps,
        # which is a frozen policy, not a hard problem.
        learning_rate=lr,
        # Reinforcement learning has no fixed end to anneal toward, and a
        # preempted run resumes mid-schedule, so the rate holds flat after a
        # short warmup instead of decaying with the default linear schedule.
        lr_scheduler_type="constant_with_warmup",
        # transformers 5 dropped warmup_ratio and kept only warmup_steps.
        warmup_steps=max(5, steps // 20),
        # Qwen3's 152k vocabulary makes the logits tensor the biggest thing on
        # the card, so training runs one sequence at a time and recovers the
        # batch through accumulation. Four prompts reach the optimizer per step.
        per_device_train_batch_size=1,
        gradient_accumulation_steps=num_generations * 2,
        num_generations=num_generations,
        # TRL 1.10 dropped max_prompt_length; prompts are capped at build time
        # by grpo-prompts.ts instead, and vLLM enforces the context window.
        max_completion_length=2048,
        vllm_max_model_length=8192,
        # A completion cut off at the length limit is not evidence about the
        # policy, so it should not contribute a gradient.
        mask_truncated_completions=True,
        # Qwen3 reasons by default, so every rollout arrived as a think block
        # plus an answer and the reward scored both. That halved the measured
        # echo, doubled the length ratio, and linted the reasoning.
        chat_template_kwargs={"enable_thinking": False},
        temperature=1.0,
        # No KL leash. The reward already gates on faithfulness and echo, so
        # the reference policy adds a second pull toward the copy habit this
        # run exists to break — and dropping it frees the reference model's
        # weights off the card.
        beta=0.0,
        # Clip-higher, from DAPO. The symmetric 0.2 window lets a token's
        # probability fall freely but caps how fast it can rise, so rare-but-
        # good phrasings never get reinforced and entropy drains away. At ten
        # times the old learning rate that collapse arrives fast.
        epsilon_high=0.28,
        # Group-level std normalisation makes a batch of near-identical
        # rollouts count as loudly as a batch that genuinely disagrees. Our
        # per-group std swings from 0.05 to 0.35, so the std comes from the
        # batch instead.
        scale_rewards="batch",
        # One ratio per rollout rather than per token. Token ratios spiked to
        # 3.0 on long completions in the last run, which is the noise GSPO
        # smooths out.
        importance_sampling_level="sequence",
        # Sequence-level ratios only work against the per-sequence objective.
        # TRL's default "dapo" loss sums per-token, so a 600-token rewrite
        # would pull six times harder than a 100-token one — backwards, when
        # shortening is half the job. This is the pairing GSPO specifies.
        loss_type="grpo",
        bf16=True,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        # Generation is the bulk of a GRPO step, so vLLM runs it colocated
        # with training rather than in a separate server.
        use_vllm=True,
        vllm_mode="colocate",
        vllm_gpu_memory_utilization=0.25,
        logging_steps=1,
        save_strategy="steps",
        save_steps=25,
        save_total_limit=3,
        report_to=[],
        seed=42,
        # Belt and braces alongside the seeded shuffle in grpo-prompts.ts.
        shuffle_dataset=True,
    )

    class CommitOnSave(TrainerCallback):
        def on_save(self, args, state, control, **kwargs):
            vol.commit()

    # `init_adapter` warm-starts from an adapter an earlier run produced, e.g.
    # "qwen3-8b-grpo-v6/final". Resuming from a checkpoint restores the step
    # counter, the optimizer, and the dataloader position, so it can only ever
    # continue the same run against the same prompts. A warm start takes the
    # weights alone: fresh optimizer, fresh step counter, new prompt set, new
    # reward. That is what carries a policy across a reward change.
    if init_adapter:
        base = AutoModelForCausalLM.from_pretrained(
            base_model, torch_dtype=torch.bfloat16, device_map=None
        )
        model = PeftModel.from_pretrained(base, f"/out/{init_adapter}", is_trainable=True)
        # The adapter carries the SFT run's dropout in its own config, and
        # loading it this way silently overrides the peft_config below — which
        # is the one that deliberately sets dropout to zero for the reasons
        # above. Turn it off on the loaded modules so a warm start trains under
        # the same rule a cold start does.
        import torch.nn as nn

        from peft.tuners.lora import LoraLayer

        for module in model.modules():
            if isinstance(module, LoraLayer):
                for key in module.lora_dropout:
                    module.lora_dropout[key] = nn.Identity()
        print(f"[init] warm start from /out/{init_adapter}, dropout off", flush=True)
    else:
        model = base_model

    trainer = GRPOTrainer(
        model=model,
        args=cfg,
        train_dataset=ds,
        reward_funcs=reward_simplification,
        # A model that already carries an adapter must not be wrapped again.
        peft_config=None if init_adapter else peft_config,
        callbacks=[CommitOnSave()],
    )
    checkpoints = sorted(
        glob.glob(f"/out/{run_name}/checkpoint-*"),
        key=lambda p: int(p.rsplit("-", 1)[-1]),
    )
    trainer.train(resume_from_checkpoint=checkpoints[-1] if checkpoints else None)
    trainer.save_model(f"/out/{run_name}/final")
    trainer.processing_class.save_pretrained(f"/out/{run_name}/final")
    vol.commit()
    return {"run_name": run_name, "steps": steps}


@app.local_entrypoint()
def main(
    base_model: str = "Qwen/Qwen3-8B",
    run_name: str = "qwen3-8b-grpo-v1",
    steps: int = 500,
    lr: float = 1e-5,
    num_generations: int = 8,
    init_adapter: str = "",
    spawn: bool = True,
):
    """Fire the job and exit.

    `modal run --detach` still holds a client connection for the whole run,
    and twice a dropped connection on this laptop turned into a cancellation
    signal on the GPU: v6 died at step 146 and again at 277. spawn() hands the
    call to Modal and returns in seconds, so the client is no longer on the
    failure path. Follow the run with `modal app logs <app-id>`.
    """
    kwargs = dict(
        base_model=base_model,
        run_name=run_name,
        steps=steps,
        lr=lr,
        num_generations=num_generations,
        init_adapter=init_adapter,
    )
    if not spawn:
        print(train.remote(**kwargs))
        return
    call = train.spawn(**kwargs)
    print(f"spawned {run_name}: call {call.object_id}")
