import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = 'compact-int8-v1';
const releaseBase = `https://models.slopsift.dev/${version}`;
const legacyBase = 'https://writinglint.nikhilv.workers.dev/model';
const source = resolve(process.env.WRITINGLINT_MODEL_SOURCE ?? join(root, 'models/rule-family-50-onnx-int8'));
const packageModel = join(root, 'packages/parser-node/model');
const artifacts = {
  'manifest.json': { bytes: 2033, sha256: '251dac348734b9fa2f7ae8db96255deacefb260db15cdef136696cd0e7d83f8f' },
  'parser.onnx': { bytes: 11877081, sha256: '587890637ce93a12762c36cfcb6c567e13288a4da34c0110767575d9ba74258b' },
  'relations.onnx': { bytes: 3400279, sha256: '8d822c25c62e9df424b9367bb5707ccee00acb4b5d08c1f1eaa985a6b634b0de' },
  'tokenizer/tokenizer.json': { bytes: 711396, sha256: 'd241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66' }, // gitleaks:allow
  'tokenizer/tokenizer_config.json': { bytes: 378, sha256: '3060793210b66fb490d6f326eb6eb566e32391000a5dd358935593ad7e6f8bd7' },
};

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function valid(path, expected) {
  if (!existsSync(path)) return false;
  const metadata = await stat(path);
  return metadata.size === expected.bytes && digest(await readFile(path)) === expected.sha256;
}

async function download(file, expected) {
  const bases = process.env.WRITINGLINT_MODEL_BASE_URL
    ? [process.env.WRITINGLINT_MODEL_BASE_URL.replace(/\/$/, '')]
    : [releaseBase, legacyBase];
  let lastError;
  for (const base of bases) {
    const url = `${base}/${file}?v=${version}`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== expected.bytes || digest(bytes) !== expected.sha256) {
        throw new Error('checksum or byte count mismatch');
      }
      const destination = join(source, file);
      await mkdir(dirname(destination), { recursive: true });
      const temporary = `${destination}.${process.pid}.tmp`;
      try {
        await writeFile(temporary, bytes);
        await rename(temporary, destination);
      } finally {
        await rm(temporary, { force: true });
      }
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = new Error(`Could not download ${url}: ${message}`);
    }
  }
  throw lastError;
}

for (const [file, expected] of Object.entries(artifacts)) {
  const path = join(source, file);
  if (!(await valid(path, expected))) {
    console.log(`Downloading ${file} (${version})`);
    await download(file, expected);
  }
}

await rm(packageModel, { recursive: true, force: true });
await mkdir(packageModel, { recursive: true });
for (const file of Object.keys(artifacts)) {
  const destination = join(packageModel, file);
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(source, file), destination);
}

console.log(`Verified ${version} and staged it for writinglint-parser-node.`);
