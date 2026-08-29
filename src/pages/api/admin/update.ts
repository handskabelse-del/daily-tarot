import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validatePost } from '../../../lib/admin-shared';

export const prerender = false;

// PATCH /api/admin/update
// body: { slug, title?, description?, body?, category?, draft? }
// Re-validates and rewrites the file. Body must be the full markdown body
// (without frontmatter); the server re-emits the frontmatter.
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const slug = String(body?.slug || '');
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid slug' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const filePath = path.join(process.cwd(), 'src', 'content', 'blog', `${slug}.md`);
    const existing = await fs.readFile(filePath, 'utf8');
    // Parse current frontmatter.
    const fmMatch = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(existing);
    if (!fmMatch) {
      return new Response(JSON.stringify({ ok: false, error: 'existing post has no frontmatter' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const fm = fmMatch[1];
    const oldBody = fmMatch[2];
    const get = (k: string) => new RegExp(`^${k}:\\s*"?(.+?)"?\\s*$`, 'm').exec(fm)?.[1] || '';
    const title = String(body.title ?? get('title'));
    const description = String(body.description ?? get('description'));
    const date = String(body.date ?? get('date'));
    const category = String(body.category ?? get('category'));
    const finalBody: string = typeof body.body === 'string' ? body.body : oldBody;
    let draft: boolean;
    if (typeof body.draft === 'boolean') draft = body.draft;
    else draft = /draft:\s*true/.test(fm);

    const v = validatePost({ kind: 'evergreen', title, description, body: finalBody, category });
    if (!v.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'validation failed', validation: v }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const yamlEscape = (s: string) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    const newFm = [
      `title: ${yamlEscape(title)}`,
      `description: ${yamlEscape(description)}`,
      `date: ${date}`,
      `category: ${yamlEscape(category)}`,
      `author: "Daily Tarot"`,
      `draft: ${draft ? 'true' : 'false'}`,
    ].join('\n');
    const newFile = `---\n${newFm}\n---\n${finalBody}`;
    await fs.writeFile(filePath, newFile, 'utf8');
    return new Response(JSON.stringify({ ok: true, slug, validation: v }), {
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
