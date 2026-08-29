import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validatePost } from '../../../lib/admin-shared';

export const prerender = false;

const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

function slugify(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function yamlEscape(s: string): string {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function buildFrontmatter(p: {
  title: string;
  description: string;
  date: string;
  category: string;
  draft: boolean;
}): string {
  return [
    '---',
    `title: ${yamlEscape(p.title)}`,
    `description: ${yamlEscape(p.description)}`,
    `date: ${p.date}`,
    `category: ${yamlEscape(p.category)}`,
    `author: "Daily Tarot"`,
    `draft: ${p.draft ? 'true' : 'false'}`,
    '---',
    '',
  ].join('\n');
}

async function saveImageFromDataUrl(
  dataUrl: string,
  destPath: string,
): Promise<string | null> {
  if (!dataUrl) return null;
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const buffer = Buffer.from(m[2], 'base64');
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buffer);
  return path.relative(path.join(process.cwd(), 'public'), destPath).replace(/\\/g, '/');
}

function pickExt(name: string | undefined): string | null {
  if (!name) return null;
  const e = path.extname(name).toLowerCase();
  return ALLOWED_EXTS.has(e) ? e : null;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const ct = request.headers.get('content-type') || '';
    let post: any;
    if (ct.includes('application/json')) {
      post = await request.json();
    } else if (ct.includes('multipart/form-data')) {
      const form = await request.formData();
      post = {
        title: String(form.get('title') || ''),
        description: String(form.get('description') || ''),
        category: String(form.get('category') || ''),
        body: String(form.get('body') || ''),
        mode: String(form.get('mode') || 'draft'),
        date: String(form.get('date') || new Date().toISOString().slice(0, 10)),
        image1DataUrl: form.get('image1DataUrl') ? String(form.get('image1DataUrl')) : undefined,
        image1Name: form.get('image1Name') ? String(form.get('image1Name')) : undefined,
        image2DataUrl: form.get('image2DataUrl') ? String(form.get('image2DataUrl')) : undefined,
        image2Name: form.get('image2Name') ? String(form.get('image2Name')) : undefined,
      };
    } else {
      return new Response(JSON.stringify({ ok: false, error: 'Unsupported content-type' }), {
        status: 415,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!post.title || !post.description || !post.body) {
      return new Response(JSON.stringify({ ok: false, error: 'title, description, body are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const v = validatePost({
      kind: 'evergreen',
      title: post.title,
      description: post.description,
      body: post.body,
      category: post.category,
    });
    if (!v.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'validation failed', validation: v }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const slug = slugify(post.title);
    if (!slug) {
      return new Response(JSON.stringify({ ok: false, error: 'could not derive slug' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const blogDir = path.join(process.cwd(), 'src', 'content', 'blog');
    const outPath = path.join(blogDir, `${slug}.md`);
    try {
      await fs.access(outPath);
      return new Response(JSON.stringify({ ok: false, error: `post already exists: ${slug}.md` }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // file does not exist, good
    }

    const blogAssetsDir = path.join(process.cwd(), 'public', 'assets', 'blog', slug);
    let image1Rel: string | null = null;
    let image2Rel: string | null = null;
    if (post.image1DataUrl) {
      const ext1 = pickExt(post.image1Name) || '.jpg';
      image1Rel = await saveImageFromDataUrl(post.image1DataUrl, path.join(blogAssetsDir, `01${ext1}`));
    }
    if (post.image2DataUrl) {
      const ext2 = pickExt(post.image2Name) || '.jpg';
      image2Rel = await saveImageFromDataUrl(post.image2DataUrl, path.join(blogAssetsDir, `02${ext2}`));
    }

    let finalBody = post.body;
    if (image1Rel) finalBody = injectImage(finalBody, image1Rel, 1);
    if (image2Rel) finalBody = injectImage(finalBody, image2Rel, 2);

    const date = post.date || new Date().toISOString().slice(0, 10);
    const file = buildFrontmatter({
      title: post.title,
      description: post.description,
      date,
      category: post.category,
      draft: post.mode !== 'publish',
    }) + finalBody;

    await fs.mkdir(blogDir, { recursive: true });
    await fs.writeFile(outPath, file, 'utf8');

    return new Response(
      JSON.stringify({
        ok: true,
        path: path.relative(process.cwd(), outPath).replace(/\\/g, '/'),
        slug,
        mode: post.mode,
        url: `/blog/${slug}`,
        images: { image1: image1Rel, image2: image2Rel },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// Replace a placeholder image tag like {{IMAGE_1}} with the real path. If
// none exists, append at a sensible spot.
function injectImage(body: string, rel: string, n: 1 | 2): string {
  const tag = `{{IMAGE_${n}}}`;
  if (body.includes(tag)) {
    return body.split(tag).join(`/${rel}`);
  }
  // Fallback: insert at the first H2 for image 1, before "Common mistakes" for image 2.
  if (n === 1) {
    const idx = body.indexOf('\n## ');
    if (idx !== -1) {
      return body.slice(0, idx) + `\n\n![Illustration](/${rel})\n` + body.slice(idx);
    }
  } else {
    const idx = body.indexOf('\n## Common mistakes');
    if (idx !== -1) {
      return body.slice(0, idx) + `\n\n![Illustration](/${rel})\n` + body.slice(idx);
    }
  }
  return `${body}\n\n![Illustration](/${rel})\n`;
}

