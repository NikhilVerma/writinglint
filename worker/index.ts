/// <reference types="@cloudflare/workers-types" />
/**
 * WritingLint site Worker (Cloudflare Workers Static Assets — the modern
 * replacement for Pages).
 *
 * The Astro build in packages/web/dist is served automatically by the assets
 * layer; this Worker runs only for paths that aren't a built file. It streams the
 * compact parser bundle (/model/*) and ONNX Runtime WASM (/ort/*) from R2 at the
 * same-origin URLs the browser already uses in local dev — they're too large to
 * ship as static assets, so they live in R2 and are edge-cached here.
 */
interface Env {
  MODELS: R2Bucket;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/(model|ort)\/(.+)$/);
    if (match) {
      const [, kind, file] = match;
      if (file.includes('..')) return new Response('invalid path', { status: 400 });
      const key = `${kind === 'model' ? 'compact-int8' : 'ort'}/${file}`;
      const object = await env.MODELS.get(key);
      if (!object) return new Response('not found', { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      // R2 objects uploaded via `wrangler r2 object put` carry no content-type, so
      // set it by extension. Critical: onnxruntime-web dynamically imports the .mjs
      // glue, and browsers reject an ES-module import unless it's served as
      // JavaScript; WASM streaming likewise needs application/wasm.
      const MIME: Record<string, string> = {
        wasm: 'application/wasm',
        mjs: 'text/javascript',
        js: 'text/javascript',
        json: 'application/json',
      };
      const ext = key.slice(key.lastIndexOf('.') + 1);
      if (MIME[ext]) headers.set('content-type', MIME[ext]);
      return new Response(object.body, { headers });
    }
    // Everything else: the static site.
    return env.ASSETS.fetch(request);
  },
};
