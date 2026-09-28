// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

// Where the site is hosted. Change these two values (or set SITE_URL / SITE_BASE)
// when hosting is decided. Every internal link on the landing page is built from `base`.
const SITE = process.env.SITE_URL ?? 'https://crypticsaiyan.github.io';
const BASE = process.env.SITE_BASE ?? '/twin';

export default defineConfig({
  site: SITE,
  base: BASE,
  output: 'static',
  vite: {
    // The landing page reads the recorded transcripts from ../examples at build time.
    server: { fs: { allow: ['..'] } },
    build: {
      rollupOptions: {
        // Astro's MDX output triggers this harmless bundler notice once per .mdx page.
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          warn(warning);
        },
      },
    },
  },
  integrations: [
    starlight({
      title: 'twin',
      description:
        'Capture the environment a command failed in, rebuild it on a clean Solari sandbox, and find the difference that breaks it.',
      logo: {
        light: './src/assets/logo-light.svg',
        dark: './src/assets/logo-dark.svg',
        alt: 'twin',
        replacesTitle: false,
      },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/crypticsaiyan/twin' }],
      lastUpdated: false,
      // The branded 404 lives in src/pages/404.astro.
      disable404Route: true,
      customCss: [
        '@fontsource-variable/inter',
        '@fontsource-variable/bricolage-grotesque',
        '@fontsource-variable/jetbrains-mono',
        './src/styles/tokens.css',
        './src/styles/starlight.css',
      ],
      expressiveCode: {
        themes: ['github-dark-default', 'github-light-default'],
        styleOverrides: {
          borderRadius: '10px',
          codeFontFamily: 'var(--twin-font-mono)',
          uiFontFamily: 'var(--twin-font-body)',
        },
      },
      sidebar: [
        { label: 'Start here', items: [{ autogenerate: { directory: 'start' } }] },
        { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
        { label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
        { label: 'Case study', items: [{ autogenerate: { directory: 'examples' } }] },
      ],
    }),
  ],
});
