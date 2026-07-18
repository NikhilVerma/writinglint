/** Decode dependency arc scores into a deterministic single-rooted tree. */

function argmax(values: readonly number[], candidates: readonly number[]): number {
  let best = candidates[0]!;
  for (const candidate of candidates.slice(1)) {
    if (values[candidate]! > values[best]!) best = candidate;
  }
  return best;
}

function findCycle(heads: readonly number[]): number[] | undefined {
  const complete = new Set<number>();
  for (let start = 1; start <= heads.length; start++) {
    if (complete.has(start)) continue;
    const path: number[] = [];
    const positions = new Map<number, number>();
    let node = start;
    while (node !== 0 && !complete.has(node)) {
      const position = positions.get(node);
      if (position !== undefined) return path.slice(position);
      positions.set(node, path.length);
      path.push(node);
      node = heads[node - 1]!;
    }
    for (const item of path) complete.add(item);
  }
  return undefined;
}

function rootConnected(heads: readonly number[]): Set<number> {
  const connected = new Set<number>();
  for (let start = 1; start <= heads.length; start++) {
    const path: number[] = [];
    const seen = new Set<number>();
    let node = start;
    while (node !== 0 && !connected.has(node) && !seen.has(node)) {
      seen.add(node);
      path.push(node);
      node = heads[node - 1]!;
    }
    if (node === 0 || connected.has(node)) {
      for (const item of path) connected.add(item);
    }
  }
  return connected;
}

/**
 * Decode dependent-by-head scores. Rows are dependents 1..N; columns are ROOT
 * (0), then tokens 1..N. Ties consistently prefer the lowest token index.
 */
export function decodeTree(scores: readonly (readonly number[])[]): number[] {
  const size = scores.length;
  if (size === 0) return [];
  if (scores.some((row) => row.length !== size + 1)) {
    throw new Error('Expected an N by N+1 dependency score matrix');
  }

  const heads = scores.map((row, index) => {
    const dependent = index + 1;
    const candidates = Array.from({ length: size }, (_, candidate) => candidate + 1)
      .filter((head) => head !== dependent);
    return candidates.length === 0 ? 0 : argmax(row, candidates);
  });

  let root = 1;
  for (let dependent = 2; dependent <= size; dependent++) {
    const advantage = scores[dependent - 1]![0]! - scores[dependent - 1]![heads[dependent - 1]!]!;
    const bestAdvantage = scores[root - 1]![0]! - scores[root - 1]![heads[root - 1]!]!;
    if (advantage > bestAdvantage) root = dependent;
  }
  heads[root - 1] = 0;

  for (let cycle = findCycle(heads); cycle; cycle = findCycle(heads)) {
    const connected = [...rootConnected(heads)].sort((a, b) => a - b);
    let best: { loss: number; dependent: number; replacement: number } | undefined;
    for (const dependent of cycle) {
      const row = scores[dependent - 1]!;
      const replacement = argmax(row, connected);
      const option = { loss: row[heads[dependent - 1]!]! - row[replacement]!, dependent, replacement };
      if (!best || option.loss < best.loss ||
          (option.loss === best.loss && option.dependent < best.dependent) ||
          (option.loss === best.loss && option.dependent === best.dependent && option.replacement < best.replacement)) {
        best = option;
      }
    }
    heads[best!.dependent - 1] = best!.replacement;
  }
  return heads;
}

export function isValidTree(heads: readonly number[]): boolean {
  if (heads.filter((head) => head === 0).length !== 1) return false;
  if (heads.some((head, index) => head < 0 || head > heads.length || head === index + 1)) return false;
  return findCycle(heads) === undefined;
}
