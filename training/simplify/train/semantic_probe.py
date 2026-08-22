"""Does semantic similarity see something 4-gram overlap cannot?

    python semantic_probe.py drift-base.jsonl drift-v7.jsonl drift-v9.jsonl

echoRate, the reward's only measure of how much a rewrite changed, counts
shared 4-grams. It cannot tell rewriting from synonym-swapping: a model that
replaces every third word and changes no meaning reads as hard work. v7 changes
70% of its words and v9 changes 44%, and nothing in the reward knows whether
either bought a change in meaning.

Two numbers per pair, both from a pinned sentence embedder:

  drift     1 - cosine(source, output) over the whole document. How much the
            meaning moved. Pair it with lexical drift: high lexical and low
            semantic drift is churn, and churn is what this exists to find.

  coverage  for each source chunk, the best cosine against any output chunk,
            averaged. How much of the source survived. This is the claim-level
            faithfulness check the anchor matcher cannot do: anchors only track
            numbers and symbols, so a dropped argument is invisible to them.

Reports both against echoRate so the two can be compared directly. Nothing here
writes to the reward; it answers whether wiring it in is worth the dependency.
"""

import json
import re
import sys
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def chunks(text: str) -> list[str]:
    """Sentence-ish units, merged until they carry enough words to embed well.

    Single sentences embed noisily: a four-word one lands near every other short
    sentence regardless of topic, which floods coverage with false matches."""
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+|\n\n+", text) if p.strip()]
    out: list[str] = []
    for part in parts:
        if out and len(out[-1].split()) < 12:
            out[-1] = f"{out[-1]} {part}"
        else:
            out.append(part)
    return out


def grams(text: str, n: int = 4) -> set:
    words = text.lower().split()
    return {tuple(words[i : i + n]) for i in range(max(0, len(words) - n + 1))}


def echo_rate(a: str, b: str) -> float:
    ga, gb = grams(a), grams(b)
    return len(ga & gb) / max(1, len(gb))


def main() -> None:
    model = SentenceTransformer(MODEL)
    print(f"{'arm':10s}{'lexical drift':>15s}{'semantic drift':>16s}{'churn ratio':>13s}{'coverage':>11s}{'cov p10':>9s}")
    for name in sys.argv[1:]:
        rows = [json.loads(l) for l in Path(name).read_text().splitlines() if l.strip()]
        lex, sem, cov = [], [], []
        for row in rows:
            src, out = row["passes"][0], row["passes"][1]
            if not src.strip() or not out.strip():
                continue
            src_chunks, out_chunks = chunks(src), chunks(out)
            if not src_chunks or not out_chunks:
                continue
            vectors = model.encode(
                [src, out] + src_chunks + out_chunks, normalize_embeddings=True, show_progress_bar=False
            )
            doc_src, doc_out = vectors[0], vectors[1]
            cs = vectors[2 : 2 + len(src_chunks)]
            co = vectors[2 + len(src_chunks) :]
            lex.append(1 - echo_rate(src, out))
            sem.append(1 - float(doc_src @ doc_out))
            cov.append(float(np.mean(np.max(cs @ co.T, axis=1))))
        arm = Path(name).stem.replace("drift-", "")
        # Churn ratio: how much of the lexical change bought no meaning change.
        # 1.0 is a pure paraphrase, 0 is a rewrite that says something new.
        churn = 1 - (np.mean(sem) / max(1e-9, np.mean(lex)))
        print(
            f"{arm:10s}{np.mean(lex):>14.1%}{np.mean(sem):>16.1%}"
            f"{churn:>13.2f}{np.mean(cov):>11.3f}{np.quantile(cov, 0.1):>9.3f}"
        )


if __name__ == "__main__":
    main()
