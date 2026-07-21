import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'dist/test/**/*.test.cjs',
  version: process.env.VSCODE_TEST_VERSION ?? 'stable',
  workspaceFolder: './test/fixtures',
  mocha: {
    timeout: 60_000,
  },
  launchArgs: [
    '--disable-extensions',
    '--disable-workspace-trust',
  ],
});
