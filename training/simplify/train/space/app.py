"""Gradio demo for the simplifier.

Loads the merged model straight from the Hub, so the Space does not depend on
our Modal deployment staying up. Set MODEL_ID in the Space settings.
"""
import difflib
import os

import gradio as gr
import spaces
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_ID = os.environ.get("MODEL_ID", "REPO_ID")
SYSTEM = open(os.path.join(os.path.dirname(__file__), "system.md")).read().strip()

tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
model = AutoModelForCausalLM.from_pretrained(MODEL_ID, torch_dtype=torch.bfloat16, device_map="cuda")


@spaces.GPU(duration=120)
def simplify(document: str, temperature: float) -> tuple[str, str]:
    document = document.strip()
    if not document:
        return "", ""
    prompt = tokenizer.apply_chat_template(
        [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Simplify this:\n\n{document}"},
        ],
        tokenize=False,
        add_generation_prompt=True,
        enable_thinking=False,
    )
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=2048,
            do_sample=True,
            temperature=temperature,
            top_p=0.8,
            top_k=20,
            pad_token_id=tokenizer.eos_token_id,
        )
    text = tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()
    return text, report(document, text)


def report(source: str, rewrite: str) -> str:
    """Word count and a plain diff. The point of the tool is that meaning
    survives, so the reader needs to see what moved."""
    src_words, out_words = len(source.split()), len(rewrite.split())
    delta = (out_words - src_words) / max(1, src_words)
    lines = [f"**{src_words} words in, {out_words} out** ({delta:+.0%})", "", "```diff"]
    lines += list(difflib.unified_diff(source.split("\n"), rewrite.split("\n"), lineterm="", n=1))[2:]
    lines.append("```")
    return "\n".join(lines)


with gr.Blocks(title="Simplifier") as demo:
    gr.Markdown(
        "# Simplifier\n"
        "Paste a pull-request description, a release note, or a README section. "
        "It comes back said plainly, with every fact, number, and code span intact."
    )
    with gr.Row():
        source = gr.Textbox(label="Your text", lines=18, placeholder="Paste here…")
        output = gr.Textbox(label="Simplified", lines=18, show_copy_button=True)
    temperature = gr.Slider(0.1, 1.0, value=0.7, step=0.05, label="Temperature")
    run = gr.Button("Simplify", variant="primary")
    detail = gr.Markdown()
    run.click(simplify, inputs=[source, temperature], outputs=[output, detail])

demo.queue().launch()
