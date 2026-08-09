import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { listDirtyGitFiles } from '../src/git-dirty.js';

const execFile = promisify(execFileCallback);

test('dirty Git discovery includes changed and untracked files but not deletions', async () => {
  const calls: Array<{ args: readonly string[]; cwd: string }> = [];
  const result = await listDirtyGitFiles('/repo/subdir', async (args, cwd) => {
    calls.push({ args, cwd });
    if (args[0] === 'rev-parse') return '/repo\n';
    return [
      ' M docs/changed.md',
      '?? docs/new.md',
      'R  docs/renamed.md',
      'docs/old.md',
      ' D docs/deleted.md',
      '',
    ].join('\0');
  });

  assert.deepEqual(result, {
    root: '/repo',
    files: ['/repo/docs/changed.md', '/repo/docs/new.md', '/repo/docs/renamed.md'],
  });
  assert.deepEqual(calls.map(({ cwd }) => cwd), ['/repo/subdir', '/repo']);
});

test('dirty Git discovery rejects paths outside the repository', async () => {
  await assert.rejects(
    listDirtyGitFiles('/repo', async (args) => args[0] === 'rev-parse' ? '/repo\n' : '?? ../secret.md\0'),
    /outside the repository/,
  );
});

test('dirty Git discovery follows the destination of a real rename', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'slopsift-git-rename-'));
  try {
    await execFile('git', ['init', '--quiet'], { cwd: directory });
    await execFile('git', ['config', 'user.email', 'slopsift@example.invalid'], { cwd: directory });
    await execFile('git', ['config', 'user.name', 'SlopSift Test'], { cwd: directory });
    await writeFile(join(directory, 'old.md'), 'A clear sentence.\n', 'utf8');
    await execFile('git', ['add', 'old.md'], { cwd: directory });
    await execFile('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: directory });
    await rename(join(directory, 'old.md'), join(directory, 'new.md'));

    const result = await listDirtyGitFiles(directory);
    assert.deepEqual(result.files, [join(result.root, 'new.md')]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
