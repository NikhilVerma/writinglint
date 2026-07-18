import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

const VERSION = 'compact-int8-v1';
const FILES = ['manifest.json', 'tokenizer/tokenizer.json', 'parser.onnx', 'relations.onnx'];
const DEFAULT_BASE = 'https://writinglint.nikhilv.workers.dev/model';
const MANIFEST_SHA256 = '251dac348734b9fa2f7ae8db96255deacefb260db15cdef136696cd0e7d83f8f';

interface ModelManifest {
  artifacts?: Record<string, { bytes?: number; sha256?: string }>;
}

function complete(directory: string): boolean {
  return FILES.every((file) => existsSync(join(directory, file)));
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

/** Verify every executable model artifact against its manifest. */
export async function verifyModelBundle(directory: string, expectedManifestHash?: string): Promise<void> {
  if (!complete(directory)) throw new Error(`model bundle is incomplete: ${directory}`);
  const manifestPath = join(directory, 'manifest.json');
  if (expectedManifestHash && await sha256(manifestPath) !== expectedManifestHash) {
    throw new Error('model manifest checksum mismatch');
  }

  let manifest: ModelManifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ModelManifest;
  } catch {
    throw new Error('model manifest is not valid JSON');
  }

  for (const file of FILES.slice(1)) {
    const expected = manifest.artifacts?.[file];
    if (!expected?.sha256 || !Number.isSafeInteger(expected.bytes)) {
      throw new Error(`model manifest has no checksum for ${file}`);
    }
    const path = join(directory, file);
    const actual = await stat(path);
    if (actual.size !== expected.bytes) throw new Error(`model artifact size mismatch: ${file}`);
    if (await sha256(path) !== expected.sha256) throw new Error(`model artifact checksum mismatch: ${file}`);
  }
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
  for (const candidate of candidates) {
    if (!complete(candidate)) continue;
    try {
      await verifyModelBundle(candidate);
      return candidate;
    } catch (error) {
      if (candidate === options.explicit) throw error;
      options.onProgress?.(`Ignoring invalid model bundle at ${candidate}: ${(error as Error).message}`);
    }
  }
  if (options.explicit) throw new Error(`model bundle is incomplete: ${options.explicit}`);

  const cacheRoot = process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache');
  const directory = join(cacheRoot, 'sloplint', 'models', VERSION);
  if (complete(directory)) {
    try {
      await verifyModelBundle(directory, MANIFEST_SHA256);
      return directory;
    } catch {
      await rm(directory, { recursive: true, force: true });
    }
  }
  if (options.download === false) throw new Error(`model is not cached at ${directory}; rerun without --no-download`);

  const base = (process.env.SLOPLINT_MODEL_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, '');
  options.onProgress?.(`Downloading Sloplint model ${VERSION} (~16 MB, once)…`);
  try {
    await download(`${base}/manifest.json?v=${VERSION}`, join(directory, 'manifest.json'));
    if (await sha256(join(directory, 'manifest.json')) !== MANIFEST_SHA256) {
      throw new Error('downloaded model manifest checksum mismatch');
    }
    for (const file of FILES.slice(1)) await download(`${base}/${file}?v=${VERSION}`, join(directory, file));
    await verifyModelBundle(directory, MANIFEST_SHA256);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return directory;
}
