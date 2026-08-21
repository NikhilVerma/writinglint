---
license: apache-2.0
base_model: Qwen/Qwen3-8B
library_name: peft
tags:
  - text2text-generation
  - editing
  - writing
pipeline_tag: text2text-generation
---

# Qwen3-8B simplifier

Rewrites technical prose so a reader gets the point sooner. It cuts padding,
names the actor, breaks overloaded sentences, and drops the ornamental
phrasing that language models tend to add. It is an editor, not a summariser:
it keeps every fact, number, identifier, and code span it was given.

## What it is for

Pull-request descriptions, release notes, READMEs, design documents, and
commit messages. Give it a document and it returns the same document, said
plainly.

## What it is not for

- It does not shorten by dropping content. Facts that go in come out.
- It does not detect whether a machine wrote something.
- It has been trained on English only.

## How to use it

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model_id = "REPO_ID"
tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(model_id, torch_dtype="auto", device_map="auto")

messages = [
    {"role": "system", "content": open("system.md").read()},
    {"role": "user", "content": "Simplify this:\n\n" + document},
]
inputs = tokenizer.apply_chat_template(
    messages, tokenize=False, add_generation_prompt=True, enable_thinking=False
)
```

Sample at `temperature=0.7, top_p=0.8, top_k=20`. Greedy decoding loops on
this task.

## How it was trained

A LoRA adapter, rank 32 on all linear layers, trained with GRPO on top of
`Qwen/Qwen3-8B`. The reward has three parts:

- **Lint.** A prose linter counts writing habits per thousand words in the
  source and in the rewrite, and the model is paid for the drop. The source
  density is floored, so a document that arrives already clean pays the model
  for leaving it alone. Without that floor a quarter of documents sat in a
  dead zone where every attempt tied at zero.
- **Faithfulness.** Code spans, URLs, and numbers in the source must survive.
  Dropping them costs; inventing new ones costs more.
- **Shape.** Verbatim copies, repetition loops, word shuffles, and rewrites
  outside a length band score zero.

## Training data

Roughly a thousand prompts drawn from public GitHub pull-request
descriptions and release notes across several large open-source projects.
Documents that were machine-generated — dependency-bump bodies, changelogs,
commit lists — were filtered out by parsing what remains after markup is
stripped and requiring real sentences. About a third of the prompts are
deliberately degraded copies of those same documents, written to carry
common bad-writing habits with the meaning unchanged, so the model sees
sloppy input often enough to learn to fix it.

The corpus itself is not published.

## Evaluation

Scored on documents from repositories the run never saw. NUMBERS_PENDING

## Limitations

- Trained on documents of roughly 120 to 900 words. Longer input drifts.
- It follows the writing policy it was trained against. That policy is
  opinionated, and a house style that disagrees will find it wrong.
- It can still rephrase a hedge into something firmer than the author meant.
  Read the diff before you ship the text.
