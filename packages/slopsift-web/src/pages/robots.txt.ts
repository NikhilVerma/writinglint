import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => new Response([
  'User-agent: *',
  'Allow: /',
  'Disallow: /model/',
  'Disallow: /ort/',
  '',
  `Sitemap: ${new URL('/sitemap.xml', site)}`,
  '',
].join('\n'), { headers: {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'public, max-age=3600',
} });
