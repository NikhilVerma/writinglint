import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const version = 'compact-int8-v1';
const baseUrl = 'https://writinglint.nikhilv.workers.dev/model';
const defaultDirectory = join(repo, 'models/rule-family-50-onnx-int8');
const directory = process.env.SLOPLINT_MODEL ?? defaultDirectory;
const files = {
  'manifest.json': '251dac348734b9fa2f7ae8db96255deacefb260db15cdef136696cd0e7d83f8f',
  'parser.onnx': '587890637ce93a12762c36cfcb6c567e13288a4da34c0110767575d9ba74258b',
  'relations.onnx': '8d822c25c62e9df424b9367bb5707ccee00acb4b5d08c1f1eaa985a6b634b0de',
  'tokenizer/tokenizer.json': 'd241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66',
};

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function valid(path, expected) {
  if (!existsSync(path)) return false;
  return digest(await readFile(path)) === expected;
}

if (process.env.SLOPLINT_MODEL) {
  const missing = Object.keys(files).filter((file) => !existsSync(join(directory, file)));
  if (missing.length) throw new Error(`SLOPLINT_MODEL is incomplete; missing ${missing.join(', ')}`);
  console.log(`Using explicit model bundle at ${directory}`);
  process.exit(0);
}

for (const [file, expected] of Object.entries(files)) {
  const destination = join(directory, file);
  if (await valid(destination, expected)) continue;
  const url = `${baseUrl}/${file}?v=${version}`;
  console.log(`Downloading ${file} (${version})`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${url}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = digest(bytes);
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${file}: expected ${expected}, received ${actual}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

console.log(`Verified model ${version} at ${directory}`);
