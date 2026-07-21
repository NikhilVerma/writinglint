import type { APIRoute } from 'astro';

const paths = ['/', '/editor/', '/docs/', '/privacy/'];

export const GET: APIRoute = ({ site }) => new Response(
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((path) => `  <url><loc>${new URL(path, site)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n'),
  { headers: {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  } },
);
