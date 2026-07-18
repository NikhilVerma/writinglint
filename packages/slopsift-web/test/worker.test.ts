import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker.js';

const emptyEnv = {} as never;

test('redirects the legacy product host to the canonical SlopSift host', async () => {
  const response = await worker.fetch(
    new Request('https://sloplint.dev/docs/getting-started?from=legacy'),
    emptyEnv,
  );

  assert.equal(response.status, 301);
  assert.equal(
    response.headers.get('location'),
    'https://slopsift.dev/docs/getting-started?from=legacy',
  );
});

test('redirects legacy model URLs without changing their immutable path', async () => {
  const response = await worker.fetch(
    new Request('https://models.sloplint.dev/compact-int8-v1/manifest.json'),
    emptyEnv,
  );

  assert.equal(response.status, 301);
  assert.equal(
    response.headers.get('location'),
    'https://models.slopsift.dev/compact-int8-v1/manifest.json',
  );
});

test('canonicalizes the new www host', async () => {
  const response = await worker.fetch(
    new Request('https://www.slopsift.dev/privacy/'),
    emptyEnv,
  );

  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), 'https://slopsift.dev/privacy/');
});
