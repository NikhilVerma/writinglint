import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyModelBundle } from '../src/model.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

test('model bundles verify artifact sizes and SHA-256 checksums', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sloplint-model-'));
  try {
    await mkdir(join(directory, 'tokenizer'));
    const artifacts = {
      'tokenizer/tokenizer.json': 'tokenizer',
      'tokenizer/tokenizer_config.json': 'tokenizer-config',
      'parser.onnx': 'parser',
      'relations.onnx': 'relations',
    };
    for (const [path, value] of Object.entries(artifacts)) await writeFile(join(directory, path), value);
    const manifest = {
      artifacts: Object.fromEntries(Object.entries(artifacts).map(([path, value]) => [
        path,
        { bytes: Buffer.byteLength(value), sha256: digest(value) },
      ])),
    };
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));

    await verifyModelBundle(directory);
    await writeFile(join(directory, 'parser.onnx'), 'tampered');
    await assert.rejects(verifyModelBundle(directory), /size mismatch|checksum mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
