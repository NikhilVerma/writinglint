/// <reference types="@cloudflare/workers-types" />
/**
 * Cloudflare Pages Function: serves the onnxruntime-web WASM runtime from the R2
 * bucket (binding MODELS, prefix `ort/`) at same-origin `/ort/<file>`. Two of the
 * kernels exceed the Pages 25 MiB static-asset limit, hence R2. Matches the
 * client's `ort.env.wasm.wasmPaths = '/ort/'`.
 */
interface Env {
  MODELS: R2Bucket;
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const rel = Array.isArray(params.path) ? params.path.join('/') : String(params.path ?? '');
  if (!/^[\w.-]+$/.test(rel)) return new Response('bad request', { status: 400 });

  const object = await env.MODELS.get(`ort/${rel}`);
  if (!object) return new Response('not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  if (rel.endsWith('.wasm')) headers.set('content-type', 'application/wasm');
  return new Response(object.body, { headers });
};
