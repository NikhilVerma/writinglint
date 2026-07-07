/// <reference types="@cloudflare/workers-types" />
/**
 * Cloudflare Pages Function: streams the parser model files from the R2 bucket
 * (binding MODELS, prefix `xsmall/`) at same-origin `/model/<file>`. The ~145 MB
 * ONNX weights exceed the Pages 25 MiB static-asset limit, so they live in R2 and
 * are edge-cached here. The browser fetches these same `/model/*` URLs that local
 * dev serves from public/model/ — so no client code changes between dev and prod.
 */
interface Env {
  MODELS: R2Bucket;
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const rel = Array.isArray(params.path) ? params.path.join('/') : String(params.path ?? '');
  if (!/^[\w.-]+$/.test(rel)) return new Response('bad request', { status: 400 });

  const object = await env.MODELS.get(`xsmall/${rel}`);
  if (!object) return new Response('not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
};
