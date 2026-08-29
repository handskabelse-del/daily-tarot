import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';

export const prerender = false;

// GET /api/admin/read?slug=foo — returns the raw markdown of a post for the
// "redact / edit" panel.
export const GET: APIRoute = async ({ url }) => {
  try {
    const slug = url.searchParams.get('slug') || '';
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid slug' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const p = path.join(process.cwd(), 'src', 'content', 'blog', `${slug}.md`);
    const txt = await fs.readFile(p, 'utf8');
    return new Response(JSON.stringify({ ok: true, slug, raw: txt }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
