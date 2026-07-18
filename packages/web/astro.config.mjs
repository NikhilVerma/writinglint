// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';

// https://astro.build/config
export default defineConfig({
  site: 'https://writinglint.pages.dev',
  integrations: [
    starlight({
      title: 'WritingLint',
      description:
        'A grammar linter for prose. Authorable rules match over a real dependency-parse + POS graph — not just regex or POS tags — so structural writing tells survive surface edits. Ships an AI-writing-style rulepack. Library, CLI, and browser demo.',
      logo: { src: './src/assets/logo.svg', replacesTitle: false },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/NikhilVerma/writinglint' }],
      customCss: ['./src/styles/custom.css'],
      // Auto-generate the authoring API reference from writinglint-core's TSDoc.
      plugins: [
        starlightTypeDoc({
          entryPoints: ['../core/src/index.ts'],
          tsconfig: '../core/tsconfig.json',
          output: 'api',
          sidebar: { label: 'API reference', collapsed: true },
          typeDoc: {
            excludeExternals: true,
            skipErrorChecking: true,
            gitRevision: 'main',
          },
        }),
      ],
      sidebar: [
        { label: 'Live demo', link: '/' },
        {
          label: 'Guides',
          items: [
            { label: 'Consume as a library', link: '/guides/consume-library/' },
            { label: 'Author a rule', link: '/guides/authoring-rules/' },
            { label: 'Command line', link: '/guides/cli/' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Why a dependency graph', link: '/reference/why-dependency-graph/' },
            { label: 'The AI-style rulepack', link: '/reference/rules/' },
          ],
        },
        typeDocSidebarGroup,
      ],
    }),
  ],
});
