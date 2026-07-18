import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

const VERSION = 'compact-int8-v1';
const FILES = ['manifest.json', 'tokenizer/tokenizer.json', 'parser.onnx', 'relations.onnx'];
const DEFAULT_BASE = 'https://writinglint.nikhilv.workers.dev/model';

function complete(directory: string): boolean {
  return FILES.every((file) => existsSync(join(directory, file)));
}

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`model download failed (${response.status} ${url})`);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await finished(Readable.fromWeb(response.body as never).pipe(createWriteStream(temporary)));
  await rename(temporary, destination);
}

export interface ModelOptions { explicit?: string; download?: boolean; onProgress?: (message: string) => void }

/** Resolve an explicit/local model or populate Sloplint's versioned user cache. */
export async function ensureModel(options: ModelOptions = {}): Promise<string> {
  const candidates = [
    options.explicit,
    process.env.SLOPLINT_MODEL,
    resolve('models/rule-family-50-onnx-int8'),
    resolve('models/rule-family-50-onnx'),
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) if (complete(candidate)) return candidate;
  if (options.explicit) throw new Error(`model bundle is incomplete: ${options.explicit}`);

  const cacheRoot = process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache');
  const directory = join(cacheRoot, 'sloplint', 'models', VERSION);
  if (complete(directory)) return directory;
  if (options.download === false) throw new Error(`model is not cached at ${directory}; rerun without --no-download`);

  const base = (process.env.SLOPLINT_MODEL_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, '');
  options.onProgress?.(`Downloading Sloplint model ${VERSION} (~16 MB, once)…`);
  try {
    for (const file of FILES) await download(`${base}/${file}?v=${VERSION}`, join(directory, file));
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return directory;
}
