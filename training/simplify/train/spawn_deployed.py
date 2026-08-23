"""Start the reward job on the DEPLOYED app and print its call id.

`modal run` builds an ephemeral app that lives only as long as the local
entrypoint. Spawning inside it and returning therefore hands back a call id
whose app is torn down a moment later, and the call resolves to an empty
RemoteError within a minute. Two run attempts died that way, and the empty
exception makes it read like a crash in the training code.

A deployed app outlives the client, which is the property spawn() was reached
for in the first place. Deploy first, then spawn through Function.from_name.

    modal deploy train/train_grpo.py
    python train/spawn_deployed.py --run-name x --init-adapter y/final
"""

import argparse

import modal

parser = argparse.ArgumentParser()
parser.add_argument("--app", default="slopsift-simplify-grpo")
parser.add_argument("--run-name", required=True)
parser.add_argument("--init-adapter", default="")
parser.add_argument("--steps", type=int, default=150)
parser.add_argument("--num-generations", type=int, default=8)
parser.add_argument("--lr", type=float, default=1e-5)
parser.add_argument("--base-model", default="Qwen/Qwen3-8B")
args = parser.parse_args()

train = modal.Function.from_name(args.app, "train")
call = train.spawn(
    base_model=args.base_model,
    run_name=args.run_name,
    steps=args.steps,
    lr=args.lr,
    num_generations=args.num_generations,
    init_adapter=args.init_adapter,
)
print(f"spawned {args.run_name}: call {call.object_id}")
