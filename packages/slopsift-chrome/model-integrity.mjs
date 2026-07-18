import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export const PINNED_MANIFEST_SHA256 = '6861b0a45090754aef9509139a77881616ec4f20a2e4d821c4375aa3644b6c92';
export const REQUIRED_MODEL_ARTIFACTS = [
  'parser.onnx',
  'relations.onnx',
  'tokenizer/tokenizer.json',
  'tokenizer/tokenizer_config.json',
];

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Verify bundle identity and every artifact declared by the release manifest. */
export async function verifyModel(directory, options = {}) {
  const manifestBytes = await readFile(join(directory, 'manifest.json'));
  const manifestHash = digest(manifestBytes);
  if (options.pinnedManifest && manifestHash !== options.pinnedManifest) {
    throw new Error(`Model manifest mismatch: expected ${options.pinnedManifest}, received ${manifestHash}`);
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  for (const file of REQUIRED_MODEL_ARTIFACTS) {
    const expected = manifest.artifacts?.[file];
    if (!expected?.sha256 || !Number.isSafeInteger(expected.bytes)) {
      throw new Error(`Model manifest does not describe ${file}`);
    }
    const path = join(directory, file);
    const metadata = await stat(path);
    if (metadata.size !== expected.bytes) {
      throw new Error(`${file} byte count mismatch: expected ${expected.bytes}, received ${metadata.size}`);
    }
    const actual = digest(await readFile(path));
    if (actual !== expected.sha256) {
      throw new Error(`${file} checksum mismatch: expected ${expected.sha256}, received ${actual}`);
    }
  }
  return { manifest, manifestHash };
}
