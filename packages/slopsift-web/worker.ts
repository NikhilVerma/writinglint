/// <reference types="@cloudflare/workers-types" />

interface Env {
  MODELS: R2Bucket;
  ASSETS: Fetcher;
}

const MODEL_VERSION = 'compact-int8-v1';
const ORT_VERSION = '1.27.0';

const markdownAsset = (path: string): string | undefined => {
  if (path === '/') return '/markdown/index.md';
  if (path === '/docs/' || path === '/docs') return '/markdown/docs.md';
  if (path === '/docs/github-actions/' || path === '/docs/github-actions') return '/markdown/github-actions.md';
  if (path === '/privacy/' || path === '/privacy') return '/markdown/privacy.md';
  if (path === '/rules/' || path === '/rules') return '/markdown/rules.md';
  const rule = path.match(/^\/rules\/([a-z0-9-]+)\/?$/)?.[1];
  return rule ? `/markdown/rules/${rule}.md` : undefined;
};

interface MediaPreference {
  q: number;
  specificity: number;
}

const preference = (accept: string, exact: string): MediaPreference => {
  let best = { q: 0, specificity: -1 };
  for (const entry of accept.toLowerCase().split(',')) {
    const [media = '', ...parameters] = entry.trim().split(';').map((part) => part.trim());
    const qValue = parameters.find((parameter) => parameter.startsWith('q='));
    const q = qValue ? Number(qValue.slice(2)) : 1;
    if (!Number.isFinite(q) || q <= 0) continue;
    const type = exact.split('/')[0];
    const specificity = media === exact ? 2 : media === `${type}/*` ? 1 : media === '*/*' ? 0 : -1;
    if (specificity < 0) continue;
    if (q > best.q || (q === best.q && specificity > best.specificity)) best = { q, specificity };
  }
  return best;
};

export const prefersMarkdown = (accept: string | null): boolean => {
  if (!accept) return false;
  const markdown = preference(accept, 'text/markdown');
  const html = preference(accept, 'text/html');
  if (markdown.specificity <= 0) return false;
  return markdown.q > html.q
    || (markdown.q === html.q && markdown.specificity >= html.specificity);
};

const withVaryAccept = (headers: Headers): void => {
  const values = new Set((headers.get('vary') ?? '').split(',').map((value) => value.trim()).filter(Boolean));
  values.add('Accept');
  headers.set('vary', [...values].join(', '));
};

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
    if (!runtimeMatch && !releaseMatch) {
      const assetPath = markdownAsset(url.pathname);
      if (assetPath && (request.method === 'GET' || request.method === 'HEAD') && prefersMarkdown(request.headers.get('accept'))) {
        const assetUrl = new URL(assetPath, url);
        const assetResponse = await env.ASSETS.fetch(new Request(assetUrl, request));
        if (assetResponse.ok) {
          const headers = new Headers(assetResponse.headers);
          headers.set('content-type', 'text/markdown; charset=utf-8');
          headers.set('content-location', url.pathname);
          headers.set('x-robots-tag', 'noindex');
          headers.set('link', `<${url.pathname}>; rel="canonical"`);
          withVaryAccept(headers);
          return new Response(request.method === 'HEAD' ? null : assetResponse.body, {
            status: assetResponse.status,
            headers,
          });
        }
      }

      const assetResponse = await env.ASSETS.fetch(request);
      if (url.pathname.startsWith('/markdown/')) {
        const headers = new Headers(assetResponse.headers);
        headers.set('content-type', 'text/markdown; charset=utf-8');
        headers.set('x-robots-tag', 'noindex');
        return new Response(request.method === 'HEAD' ? null : assetResponse.body, {
          status: assetResponse.status,
          headers,
        });
      }
      if (!assetPath) return assetResponse;
      const headers = new Headers(assetResponse.headers);
      headers.append('link', `<${assetPath}>; rel="alternate"; type="text/markdown"`);
      withVaryAccept(headers);
      return new Response(request.method === 'HEAD' ? null : assetResponse.body, {
        status: assetResponse.status,
        headers,
      });
    }
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
