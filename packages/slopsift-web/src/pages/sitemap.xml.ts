import type { APIRoute } from 'astro';
import catalog from '../generated/rules.json';

const paths = [
  '/',
  '/editor/',
  '/docs/',
  '/docs/github-actions/',
  '/rules/',
  '/privacy/',
  ...catalog.rules.map((rule) => `/rules/${rule.name}/`),
];

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
