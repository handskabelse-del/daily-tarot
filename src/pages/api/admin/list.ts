import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';

export const prerender = false;

type PostSummary = {
  slug: string;
  title: string;
  description: string;
  date: string;
  category: string;
  draft: boolean;
};

export const GET: APIRoute = async ({ url }) => {
  try {
    const dir = path.join(process.cwd(), 'src', 'content', 'blog');
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'));
    const filter = url.searchParams.get('filter') || 'all'; // all | draft | published
    const items: PostSummary[] = [];
    for (const f of files) {
      const txt = await fs.readFile(path.join(dir, f), 'utf8');
      const title = txt.match(/^title:\s*"?(.+?)"?\s*$/m)?.[1] || f;
      const description = txt.match(/^description:\s*"?(.+?)"?\s*$/m)?.[1] || '';
      const date = txt.match(/^date:\s*(\S+)/m)?.[1] || '';
      const category = txt.match(/^category:\s*"?(.+?)"?\s*$/m)?.[1] || '';
      const draft = /draft:\s*true/.test(txt);
      const slug = f.replace(/\.md$/, '');
      const item: PostSummary = { slug, title, description, date, category, draft };
      if (filter === 'draft' && !draft) continue;
      if (filter === 'published' && draft) continue;
      items.push(item);
    }
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return new Response(JSON.stringify({ ok: true, posts: items }), {
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
