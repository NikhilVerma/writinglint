import { existsSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import ignore from 'ignore';
import { glob } from 'tinyglobby';
import { DEFAULT_EXTENSIONS, inputKind } from './extract.js';

export interface FileOptions { cwd?: string; noIgnore?: boolean; ignorePatterns?: string[]; extensions?: string[] }

function slash(path: string): string { return path.split(sep).join('/'); }

function ignored(file: string, cwd: string, matcher: ReturnType<typeof ignore>): boolean {
  const local = slash(relative(cwd, file));
  // Explicit absolute paths outside cwd are not governed by cwd's .gitignore.
  return local === '..' || local.startsWith('../') ? false : matcher.ignores(local);
}

export async function findFiles(patterns: string[], options: FileOptions = {}): Promise<string[]> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const extensions = new Set((options.extensions ?? DEFAULT_EXTENSIONS).map((ext) => ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`));
  const expanded = patterns.flatMap((pattern) => {
    const absolute = resolve(cwd, pattern);
    if (existsSync(absolute) && statSync(absolute).isDirectory()) return [`${slash(relative(cwd, absolute)) || '.'}/**/*`];
    return [pattern];
  });
  const found = await glob(expanded, { cwd, absolute: true, onlyFiles: true, dot: false, followSymbolicLinks: false });
  const matcher = ignore().add(['node_modules/', '.git/', 'dist/', 'build/', 'coverage/']);
  if (!options.noIgnore && existsSync(resolve(cwd, '.gitignore'))) matcher.add(readFileSync(resolve(cwd, '.gitignore'), 'utf8'));
  matcher.add(options.ignorePatterns ?? []);
  return [...new Set(found)]
    .filter((file) => extensions.has(file.slice(file.lastIndexOf('.')).toLowerCase()) && inputKind(file))
    .filter((file) => options.noIgnore || !ignored(file, cwd, matcher))
    .sort();
}
