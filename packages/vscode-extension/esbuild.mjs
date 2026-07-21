import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const buildTests = process.argv.includes('--test');
// Resolve build inputs from the workspace root, never from the generated local
// node_modules directory that this script replaces on every package build.
const require = createRequire(new URL('../../package.json', import.meta.url));

function runtimeTarget() {
  const requested = process.env.SLOPSIFT_VSCODE_TARGET;
  if (!requested) return { platform: process.platform, architecture: process.arch };
  const separator = requested.indexOf('-');
  if (separator < 1) throw new Error(`Invalid VS Code target: ${requested}`);
  const platform = requested.slice(0, separator);
  const architecture = requested.slice(separator + 1);
  return { platform, architecture };
}

async function copyNativeRuntime() {
  const packageRoot = dirname(require.resolve('onnxruntime-node/package.json'));
  const { platform, architecture } = runtimeTarget();
  const platformRuntime = join(packageRoot, 'bin', 'napi-v6', platform, architecture);
  await rm(join(here, 'node_modules'), { recursive: true, force: true });
  await rm(join(here, 'bin'), { recursive: true, force: true });
  await rm(join(here, 'model'), { recursive: true, force: true });
  const destination = join(here, 'bin', 'napi-v6', platform, architecture);
  await mkdir(dirname(destination), { recursive: true });
  try {
    await cp(platformRuntime, destination, { recursive: true });
  } catch (error) {
    throw new Error(`ONNX Runtime does not ship native binaries for ${platform}-${architecture}`, { cause: error });
  }
  await cp(join(here, '..', 'parser-node', 'model'), join(here, 'model'), { recursive: true });
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

if (!buildTests) await copyNativeRuntime();

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
  banner: {
    js: 'const __slopsift_import_meta_url = require("node:url").pathToFileURL(__filename).href;',
  },
  define: {
    'import.meta.url': '__slopsift_import_meta_url',
  },
  plugins: [nativeBindingPlugin],
};

if (buildTests) {
  await esbuild.build({
    absWorkingDir: here,
    entryPoints: ['test/integration/extension.test.ts'],
    outfile: 'dist/test/extension.test.cjs',
    bundle: true,
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    sourcemap: 'inline',
    logLevel: 'info',
  });
} else if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log('Watching SlopSift for VS Code…');
} else {
  await esbuild.build(options);
}
