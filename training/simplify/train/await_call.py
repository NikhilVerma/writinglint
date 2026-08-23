"""Blocks on an already-spawned Modal call and prints its result as JSON.

train_grpo.py spawns rather than runs, so the laptop is not on the failure path
for a three-hour job. That leaves the call id as the only handle on the run, and
this is the other half: given the id, wait for it and report.

Splitting spawn from await is what makes the orchestration resumable. A crash
after the spawn re-enters here with the recorded id instead of paying for a
second GPU job.

    python train/await_call.py <call-id> [timeout-seconds]
"""

import json
import sys

import modal

call_id = sys.argv[1]
timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 6 * 3600

result = modal.FunctionCall.from_id(call_id).get(timeout=timeout)
print(json.dumps({"callId": call_id, "result": result}, default=str))
