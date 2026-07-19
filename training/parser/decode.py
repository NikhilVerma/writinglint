"""Deterministic single-root dependency decoding with minimum-loss cycle repair."""

from __future__ import annotations

from collections.abc import Sequence


def _argmax(values: Sequence[float], candidates: Sequence[int]) -> int:
    """Return the lowest-index maximum for stable Python/TypeScript parity."""
    return max(candidates, key=lambda index: (values[index], -index))


def _cycle(heads: Sequence[int]) -> list[int] | None:
    """Find one directed cycle in 1-based dependent-to-head assignments."""
    complete: set[int] = set()
    for start in range(1, len(heads) + 1):
        if start in complete:
            continue
        path: list[int] = []
        positions: dict[int, int] = {}
        node = start
        while node != 0 and node not in complete:
            if node in positions:
                return path[positions[node] :]
            positions[node] = len(path)
            path.append(node)
            node = heads[node - 1]
        complete.update(path)
    return None


def _root_connected(heads: Sequence[int]) -> set[int]:
    """Return tokens whose current head chain reaches ROOT."""
    connected: set[int] = set()
    for start in range(1, len(heads) + 1):
        path: list[int] = []
        seen: set[int] = set()
        node = start
        while node != 0 and node not in connected and node not in seen:
            seen.add(node)
            path.append(node)
            node = heads[node - 1]
        if node == 0 or node in connected:
            connected.update(path)
    return connected


def decode_tree(scores: Sequence[Sequence[float]]) -> list[int]:
    """Decode one rooted acyclic tree from dependent-by-head arc scores.

    Rows represent dependents 1..N and columns represent ROOT (0), then tokens
    1..N. The decoder first chooses the globally best single root under otherwise
    independent head choices. It then breaks each cycle using the alternative
    edge with the smallest score loss. Self edges must be absent or have a low
    score; they are explicitly excluded here as a safety invariant.
    """
    size = len(scores)
    if size == 0:
        return []
    if any(len(row) != size + 1 for row in scores):
        raise ValueError("Expected an N by N+1 dependency score matrix")

    non_root: list[int] = []
    for dependent, row in enumerate(scores, start=1):
        candidates = [head for head in range(1, size + 1) if head != dependent]
        if not candidates:
            non_root.append(0)
        else:
            non_root.append(_argmax(row, candidates))

    # Pick the root whose forced root edge sacrifices the least score compared
    # with that dependent's best non-root edge. This maximizes the constrained
    # one-root greedy objective before cycle repair.
    root = max(
        range(1, size + 1),
        key=lambda dependent: (
            scores[dependent - 1][0] - scores[dependent - 1][non_root[dependent - 1]],
            -dependent,
        ),
    )
    heads = non_root
    heads[root - 1] = 0

    while (cycle := _cycle(heads)) is not None:
        connected = _root_connected(heads)
        best: tuple[float, int, int] | None = None
        for dependent in cycle:
            row = scores[dependent - 1]
            # Attaching to the already rooted component strictly increases that
            # component and cannot create a larger cycle through descendants.
            candidates = sorted(connected)
            replacement = _argmax(row, candidates)
            loss = row[heads[dependent - 1]] - row[replacement]
            option = (loss, dependent, replacement)
            if best is None or option < best:
                best = option
        if best is None:
            raise RuntimeError("Could not find a rooted replacement edge for a dependency cycle")
        _, dependent, replacement = best
        heads[dependent - 1] = replacement

    return heads


def valid_tree(heads: Sequence[int]) -> bool:
    """Return whether heads form exactly one rooted, acyclic dependency tree."""
    size = len(heads)
    if sum(head == 0 for head in heads) != 1:
        return False
    if any(
        head < 0 or head > size or head == dependent
        for dependent, head in enumerate(heads, start=1)
    ):
        return False
    return _cycle(heads) is None
