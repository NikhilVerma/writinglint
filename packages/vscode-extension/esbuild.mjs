import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
// Resolve build inputs from the workspace root, never from the generated local
// node_modules directory that this script replaces on every package build.
const require = createRequire(new URL('../../package.json', import.meta.url));

async function copyNativeRuntime() {
  const packageRoot = dirname(require.resolve('onnxruntime-node/package.json'));
  const platformRuntime = join(packageRoot, 'bin', 'napi-v6', process.platform, process.arch);
  await rm(join(here, 'node_modules'), { recursive: true, force: true });
  await rm(join(here, 'bin'), { recursive: true, force: true });
  const destination = join(here, 'bin', 'napi-v6', process.platform, process.arch);
  await mkdir(dirname(destination), { recursive: true });
  await cp(platformRuntime, destination, { recursive: true });
}

const nativeBindingPlugin = {
  name: 'onnxruntime-native-binding',
  setup(build) {
    build.onLoad({ filter: /onnxruntime-node[/\\]dist[/\\]binding\.js$/ }, async ({ path }) => {
      const source = await readFile(path, 'utf8');
      const original = 'require(`../bin/napi-v6/${process.platform}/${process.arch}/onnxruntime_binding.node`)';
      const replacement = 'module.require(`${__dirname}/../bin/napi-v6/${process.platform}/${process.arch}/onnxruntime_binding.node`)';
      if (!source.includes(original)) throw new Error('Unsupported onnxruntime-node binding layout');
      return { contents: source.replace(original, replacement), loader: 'js' };
    });
  },
};

await copyNativeRuntime();

const options = {
  absWorkingDir: here,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.cjs',
  bundle: true,
  conditions: ['source'],
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  minify: production,
  sourcemap: production ? false : 'inline',
  logLevel: 'info',
  plugins: [nativeBindingPlugin],
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log('Watching Sloplint for VS Code…');
} else {
  await esbuild.build(options);
}
