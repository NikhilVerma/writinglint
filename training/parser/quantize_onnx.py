"""Dynamically quantize an exported parser bundle for Node and browser CPU runtimes."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from onnxruntime.quantization import QuantType, quantize_dynamic


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    # Preserve the compact-int8-v1 graph hashes. ORT preprocessing was tested,
    # retained identical holdout decisions, but changed the released artifacts.
    # Introduce it only with a deliberately versioned model format.
    for name in ("parser.onnx", "relations.onnx"):
        quantize_dynamic(
            args.model / name,
            args.output / name,
            weight_type=QuantType.QInt8,
            per_channel=True,
        )
    tokenizer_output = args.output / "tokenizer"
    if tokenizer_output.exists():
        shutil.rmtree(tokenizer_output)
    shutil.copytree(args.model / "tokenizer", tokenizer_output)
    source = json.loads((args.model / "manifest.json").read_text(encoding="utf-8"))
    paths = [
        args.output / "parser.onnx",
        args.output / "relations.onnx",
        *sorted(tokenizer_output.iterdir()),
    ]
    source.update(
        {
            "format": "writinglint-compact-parser-onnx-int8-v1",
            "quantization": {
                "mode": "dynamic",
                "weightType": "QInt8",
                "perChannel": True,
            },
            "source_manifest_sha256": sha256(args.model / "manifest.json"),
            "artifacts": {
                str(path.relative_to(args.output)): {
                    "bytes": path.stat().st_size,
                    "sha256": sha256(path),
                }
                for path in paths
                if path.is_file()
            },
        }
    )
    source.pop("validation", None)
    (args.output / "manifest.json").write_text(
        json.dumps(source, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(source, indent=2))


if __name__ == "__main__":
    main()
