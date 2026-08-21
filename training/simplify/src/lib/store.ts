import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { runsDir, sourcesDir } from './env.ts';

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function sourceIdFor(model: string, promptId: string, promptVersion: string): string {
  return sha256(`${model}|${promptId}|${promptVersion}`).slice(0, 12);
}

export function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as T);
}

export function appendJsonl(file: string, record: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
}

export function sourcePath(sourceId: string): string {
  return path.join(sourcesDir, `source-${sourceId}.md`);
}

export function sourceMetaPath(sourceId: string): string {
  return path.join(sourcesDir, `source-${sourceId}.json`);
}

export function trialDir(trial: string): string {
  return path.join(runsDir, trial);
}

export function trialFile(trial: string, name: string): string {
  return path.join(trialDir(trial), name);
}

export function workDir(trial: string, sourceId: string): string {
  return path.join(trialDir(trial), 'work', sourceId);
}

export function draftPath(trial: string, sourceId: string): string {
  return path.join(workDir(trial, sourceId), 'draft.md');
}

export function readDraft(trial: string, sourceId: string): string {
  return readFileSync(draftPath(trial, sourceId), 'utf8');
}

export function writeJsonPretty(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Source ids that already have a terminal outcome in this trial. */
export function settledSourceIds(trial: string): Set<string> {
  const settled = new Set<string>();
  for (const name of ['accepted.jsonl', 'rejected.jsonl', 'unresolved.jsonl', 'human-review.jsonl']) {
    for (const record of readJsonl<{ sourceId: string }>(trialFile(trial, name))) {
      settled.add(record.sourceId);
    }
  }
  return settled;
}
