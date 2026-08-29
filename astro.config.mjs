import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://dailytarot.example.com',
  output: 'static',
  adapter: cloudflare({
    // The public site remains fully static. The /admin and /api/admin/*
    // routes are server-rendered (prerender = false) and are BLOCKED
    // in production by src/middleware.ts — so the deployed bundle
    // always responds 404 to /admin* (verified by `import.meta.env.PROD`).
    // In dev they run normally at http://localhost:4321/admin.
    // The Cloudflare adapter is required so the build can compile the
    // two functions in functions/api/* (reading, limit) that the live
    // site actually uses.
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
