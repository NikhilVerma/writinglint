import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('manifest contributes the Sloplint diagnostics controls and commands', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
    main: string;
    activationEvents: string[];
    contributes: { commands: Array<{ command: string }>; configuration: { properties: Record<string, unknown> } };
  };
  assert.equal(manifest.main, './dist/extension.cjs');
  assert.ok(manifest.activationEvents.includes('onStartupFinished'));
  assert.deepEqual(manifest.contributes.commands.map(({ command }) => command), [
    'sloplint.lintDocument',
    'sloplint.showOutput',
  ]);
  assert.ok(manifest.contributes.configuration.properties['sloplint.enable']);
  assert.ok(manifest.contributes.configuration.properties['sloplint.minimumLevel']);
});
