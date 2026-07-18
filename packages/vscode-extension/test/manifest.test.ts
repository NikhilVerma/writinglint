import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('manifest contributes the SlopSift diagnostics controls and commands', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
    main: string;
    activationEvents: string[];
    contributes: { commands: Array<{ command: string }>; configuration: { properties: Record<string, unknown> } };
  };
  assert.equal(manifest.main, './dist/extension.cjs');
  assert.ok(manifest.activationEvents.includes('onStartupFinished'));
  assert.deepEqual(manifest.contributes.commands.map(({ command }) => command), [
    'slopsift.lintDocument',
    'slopsift.showOutput',
  ]);
  assert.ok(manifest.contributes.configuration.properties['slopsift.enable']);
  assert.ok(manifest.contributes.configuration.properties['slopsift.minimumLevel']);
});
