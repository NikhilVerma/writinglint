"""Download explicitly allowlisted Universal Dependencies treebanks."""

from __future__ import annotations

import argparse
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Treebank:
    repository: str
    directory: str
    license: str
    commercial: bool


TREEBANKS = {
    "ewt": Treebank(
        repository="https://github.com/UniversalDependencies/UD_English-EWT.git",
        directory="UD_English-EWT",
        license="CC BY-SA 4.0",
        commercial=True,
    ),
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--treebank", choices=sorted(TREEBANKS), required=True)
    parser.add_argument("--data-root", type=Path, default=Path(__file__).parent / "data")
    parser.add_argument("--revision", default="master")
    args = parser.parse_args()

    treebank = TREEBANKS[args.treebank]
    destination = args.data_root / treebank.directory
    args.data_root.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        subprocess.run(["git", "-C", str(destination), "fetch", "--depth", "1", "origin", args.revision], check=True)
        subprocess.run(["git", "-C", str(destination), "checkout", "FETCH_HEAD"], check=True)
    else:
        subprocess.run(
            ["git", "clone", "--depth", "1", "--branch", args.revision, treebank.repository, str(destination)],
            check=True,
        )
    print(f"Downloaded {args.treebank}: {treebank.license} -> {destination}")


if __name__ == "__main__":
    main()
