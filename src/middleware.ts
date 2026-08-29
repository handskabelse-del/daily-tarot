// Global Astro middleware.
// In production builds, this blocks the local-only admin UI and its API
// routes so they cannot be reached on the public site. In dev, every
// request is allowed through and /admin works normally at
// http://localhost:4321/admin.
//
// `import.meta.env.PROD` is replaced at build time by Vite:
//   - dev server   -> false  (admin is reachable)
//   - astro build  -> true   (admin returns 404 + noindex)
//
// The middleware runs *before* any page or API route, so even if the
// /admin HTML page was somehow shipped, hitting it in production
// would return a clean 404 from this layer rather than executing
// the page (and potentially leaking any sensitive error messages).
import { defineMiddleware } from 'astro:middleware';

const ADMIN_PREFIXES = ['/admin', '/api/admin/'];

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = new URL(context.request.url).pathname;
  const isAdminRoute =
    pathname === '/admin' ||
    pathname === '/admin/' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/api/admin/');

  if (isAdminRoute && import.meta.env.PROD) {
    // Belt + suspenders: the admin UI is also marked `prerender = false`,
    // but defense in depth doesn't hurt. Returning 404 here guarantees
    // no admin surface reaches production even if the build config is
    // changed later.
    return new Response('Not Found', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        // Hard-stop indexing by any crawler or browser.
        'x-robots-tag': 'noindex, nofollow, noarchive',
        'cache-control': 'no-store',
      },
    });
  }

  return next();
});