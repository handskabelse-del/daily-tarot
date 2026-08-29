import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://dailytarot.example.com',
  output: 'static',
  adapter: cloudflare({
    // The public site remains fully static. Only the /admin and /api/admin/*
    // routes are server-rendered (they carry `export const prerender = false`).
    // The Cloudflare adapter is only required for the build to succeed with
    // those on-demand routes; in dev the Astro dev server runs them directly.
    imageService: 'passthrough',
  }),
  trailingSlash: 'never',
  build: {
    format: 'directory',
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en-US',
          es: 'es-ES',
          fr: 'fr-FR',
        },
      },
    }),
    mdx(),
  ],
  vite: {
    build: {
      cssCodeSplit: true,
    },
    ssr: {
      // The admin API routes use node:fs/promises and node:path at runtime.
      // Externalize them so Vite doesn't try to bundle them.
      external: ['node:fs/promises', 'node:path', 'node:fs'],
    },
    server: {
      proxy: {
        // Only the two Cloudflare Functions (limit + reading) need to be
        // proxied to wrangler in dev. Everything else under /api/* is served
        // directly by Astro (e.g. /api/admin/* for the local admin UI).
        '/api/reading': {
          target: 'http://127.0.0.1:8788',
          changeOrigin: true,
          secure: false,
        },
        '/api/limit': {
          target: 'http://127.0.0.1:8788',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  },
});
