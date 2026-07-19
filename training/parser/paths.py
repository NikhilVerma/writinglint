"""Portable path metadata for reproducible public model manifests."""

from __future__ import annotations

from pathlib import Path


def portable_reference(path: Path, base: Path | None = None) -> str:
    """Return a relative artifact reference without leaking an absolute path."""
    if not path.is_absolute():
        return path.as_posix()

    root = (base or Path.cwd()).resolve()
    try:
        return path.resolve().relative_to(root).as_posix()
    except ValueError:
        return path.name
