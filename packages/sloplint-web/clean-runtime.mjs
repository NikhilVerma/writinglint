import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
await Promise.all([
  rm(join(root, 'public/model'), { recursive: true, force: true }),
  rm(join(root, 'public/ort'), { recursive: true, force: true }),
]);
