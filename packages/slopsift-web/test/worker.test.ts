import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { prefersMarkdown } from '../worker.js';

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

test('negotiates Markdown only when the client prefers it explicitly', () => {
  assert.equal(prefersMarkdown(null), false);
  assert.equal(prefersMarkdown('*/*'), false);
  assert.equal(prefersMarkdown('text/html'), false);
  assert.equal(prefersMarkdown('text/*'), true);
  assert.equal(prefersMarkdown('text/markdown, text/html;q=0.9'), true);
  assert.equal(prefersMarkdown('text/markdown;q=0.5, text/html'), false);
});

test('serves generated Markdown for an eligible canonical page', async () => {
  const env = {
    ASSETS: {
      fetch: async (request: Request) => new Response(
        `asset:${new URL(request.url).pathname}`,
        { headers: { vary: 'Accept-Encoding' } },
      ),
    },
  } as never;
  const response = await worker.fetch(
    new Request('https://slopsift.dev/rules/false-agency/', {
      headers: { accept: 'text/markdown, text/html;q=0.8' },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.equal(response.headers.get('content-location'), '/rules/false-agency/');
  assert.equal(response.headers.get('vary'), 'Accept-Encoding, Accept');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  assert.equal(await response.text(), 'asset:/markdown/rules/false-agency.md');
});

test('advertises Markdown while serving normal HTML', async () => {
  const env = {
    ASSETS: {
      fetch: async () => new Response('<html>docs</html>', {
        headers: { 'content-type': 'text/html' },
      }),
    },
  } as never;
  const response = await worker.fetch(
    new Request('https://slopsift.dev/docs/'),
    env,
  );

  assert.equal(response.headers.get('content-type'), 'text/html');
  assert.equal(response.headers.get('vary'), 'Accept');
  assert.match(response.headers.get('link') ?? '', /markdown\/docs\.md/);
});
