import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'https://sloplint.dev',
  build: { format: 'directory' },
});
