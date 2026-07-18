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

test('keeps the model hostname from serving a duplicate marketing site', async () => {
  const response = await worker.fetch(
    new Request('https://models.slopsift.dev/docs/?from=model-host'),
    emptyEnv,
  );

  assert.equal(response.status, 301);
  assert.equal(
    response.headers.get('location'),
    'https://slopsift.dev/docs/?from=model-host',
  );
});

test('blocks crawlers from the immutable model hostname', async () => {
  const response = await worker.fetch(
    new Request('https://models.slopsift.dev/robots.txt'),
    emptyEnv,
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'User-agent: *\nDisallow: /\n');
});

test('marks model artifacts as non-indexable', async () => {
  const env = {
    MODELS: {
      get: async () => ({
        body: null,
        httpEtag: '"model-etag"',
        writeHttpMetadata: () => undefined,
      }),
    },
  } as never;
  const response = await worker.fetch(
    new Request('https://models.slopsift.dev/compact-int8-v1/manifest.json', { method: 'HEAD' }),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, nosnippet');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});
