import type { APIRoute } from 'astro';
import { suggestTopics } from '../../../lib/admin-server';
import { CATEGORIES, MODELS } from '../../../lib/admin-shared';
import fs from 'node:fs/promises';
import path from 'node:path';

export const prerender = false;

// List recent post titles so the suggester can avoid duplicates.
async function loadRecentTitles(): Promise<string[]> {
  const dir = path.join(process.cwd(), 'src', 'content', 'blog');
  try {
    const files = await fs.readdir(dir);
    const titles: Array<{ date: string; title: string }> = [];
    for (const f of files.filter((f) => f.endsWith('.md'))) {
      const txt = await fs.readFile(path.join(dir, f), 'utf8');
      const m = txt.match(/^title:\s*"?(.+?)"?\s*$/m);
      const d = txt.match(/^date:\s*(\S+)/m);
      if (m) titles.push({ date: d?.[1] || '', title: m[1] });
    }
    titles.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return titles.slice(0, 20).map((t) => t.title);
  } catch {
    return [];
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const seed = typeof body?.seed === 'string' ? body.seed : undefined;
    const model = typeof body?.model === 'string' && MODELS.find((m) => m.id === body.model) ? body.model : undefined;
    const recentTitles = await loadRecentTitles();
    const out = await suggestTopics({ seed, recentTitles, model });
    return new Response(JSON.stringify(out), {
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

// GET returns the static config the UI needs.
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ models: MODELS, categories: CATEGORIES }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
