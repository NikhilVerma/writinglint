import { execFile as execFileCallback } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export interface GitDirtyState {
  root: string;
  files: string[];
}

type GitRunner = (args: readonly string[], cwd: string) => Promise<string>;

async function defaultGitRunner(args: readonly string[], cwd: string): Promise<string> {
  const { stdout } = await execFile('git', [...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

function isInside(root: string, file: string): boolean {
  return file === root || file.startsWith(`${root}${sep}`);
}

/** Return modified, staged, renamed, and untracked files that still exist. */
export async function listDirtyGitFiles(
  cwd = process.cwd(),
  runGit: GitRunner = defaultGitRunner,
): Promise<GitDirtyState> {
  const root = (await runGit(['rev-parse', '--show-toplevel'], cwd)).trim();
  if (!root) throw new Error(`could not find a Git repository from ${cwd}`);

  const output = await runGit(['status', '--porcelain=v1', '-z', '--untracked-files=all'], root);
  const fields = output.split('\0');
  const files: string[] = [];
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    if (!field) continue;
    if (field.length < 4 || field[2] !== ' ') throw new Error('could not parse Git status output');
    const status = field.slice(0, 2);
    const path = field.slice(3);
    if (status.includes('R') || status.includes('C')) index++;
    if (status.includes('D')) continue;
    const absolute = resolve(root, path);
    if (!isInside(root, absolute)) throw new Error(`Git reported a path outside the repository: ${path}`);
    files.push(absolute);
  }
  return { root, files: [...new Set(files)].sort() };
}
