import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { findFiles } from '../src/files.js';

test('directory discovery supports source/prose files and respects .gitignore', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'slopsift-files-'));
  await mkdir(join(cwd, 'src'));
  await mkdir(join(cwd, 'generated'));
  await writeFile(join(cwd, '.gitignore'), 'generated/\n');
  await writeFile(join(cwd, 'README.md'), '# Read me\n');
  await writeFile(join(cwd, 'src', 'index.ts'), '// prose\nexport {};\n');
  await writeFile(join(cwd, 'src', 'image.png'), 'not prose');
  await writeFile(join(cwd, 'generated', 'ignored.md'), 'ignore me');
  const files = await findFiles(['.'], { cwd });
  assert.deepEqual(files.map((file) => file.slice(cwd.length + 1)), ['README.md', 'src/index.ts']);
});

test('glob discovery accepts extension overrides and extra ignores', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'slopsift-glob-'));
  await writeFile(join(cwd, 'one.md'), 'one');
  await writeFile(join(cwd, 'two.txt'), 'two');
  const files = await findFiles(['*.{md,txt}'], { cwd, extensions: ['txt'], ignorePatterns: ['two.txt'] });
  assert.deepEqual(files, []);
});

test('an explicit absolute file outside cwd bypasses cwd-local ignore matching', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'slopsift-cwd-'));
  const external = await mkdtemp(join(tmpdir(), 'slopsift-external-'));
  const file = join(external, 'README.md');
  await writeFile(file, 'prose');
  assert.deepEqual(await findFiles([file], { cwd }), [file]);
});
