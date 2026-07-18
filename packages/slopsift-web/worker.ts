/// <reference types="@cloudflare/workers-types" />

interface Env {
  MODELS: R2Bucket;
  ASSETS: Fetcher;
}

const MODEL_VERSION = 'compact-int8-v1';
const ORT_VERSION = '1.27.0';

const contentType = (path: string): string | undefined => {
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.mjs') || path.endsWith('.js')) return 'text/javascript';
  if (path.endsWith('.wasm')) return 'application/wasm';
  if (path.endsWith('.onnx')) return 'application/octet-stream';
  return undefined;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === 'sloplint.dev' || url.hostname === 'www.sloplint.dev' || url.hostname === 'www.slopsift.dev') {
      url.hostname = 'slopsift.dev';
      return Response.redirect(url.toString(), 301);
    }
    if (url.hostname === 'models.sloplint.dev') {
      url.hostname = 'models.slopsift.dev';
      return Response.redirect(url.toString(), 301);
    }
    const runtimeMatch = url.pathname.match(/^\/(model|ort)\/(.+)$/);
    const releaseMatch = url.pathname.match(new RegExp(`^/${MODEL_VERSION}/(.+)$`));
    if (url.hostname === 'models.slopsift.dev') {
      if (url.pathname === '/robots.txt') {
        return new Response('User-agent: *\nDisallow: /\n', {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=3600',
          },
        });
      }
      if (!releaseMatch) {
        url.hostname = 'slopsift.dev';
        return Response.redirect(url.toString(), 301);
      }
    }
    if (!runtimeMatch && !releaseMatch) return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    }

    const kind = runtimeMatch?.[1] ?? 'model';
    const file = runtimeMatch?.[2] ?? releaseMatch?.[1];
    if (!file || file.includes('..')) return new Response('invalid path', { status: 400 });
    const key = kind === 'model'
      ? `${MODEL_VERSION}/${file}`
      : `onnxruntime-web/${ORT_VERSION}/${file}`;
    const object = await env.MODELS.get(key);
    if (!object) return new Response('not found', {
      status: 404,
      headers: { 'x-robots-tag': 'noindex, nofollow, nosnippet' },
    });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('x-robots-tag', 'noindex, nofollow, nosnippet');
    const type = contentType(file);
    if (type) headers.set('content-type', type);
    return new Response(request.method === 'HEAD' ? null : object.body, { headers });
  },
};
