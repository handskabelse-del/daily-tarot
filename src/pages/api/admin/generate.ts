import type { APIRoute } from 'astro';
import { generateEvergreenPost } from '../../../lib/admin-server';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const topic = String(body?.topic || '').trim();
    if (!topic) {
      return new Response(JSON.stringify({ ok: false, error: 'topic is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const result = await generateEvergreenPost({
      topic,
      category: String(body?.category || ''),
      primaryKeyword: String(body?.primaryKeyword || ''),
      secondaryKeywords: Array.isArray(body?.secondaryKeywords)
        ? body.secondaryKeywords.map((s: any) => String(s).trim()).filter(Boolean)
        : String(body?.secondaryKeywords || '').split(',').map((s: string) => s.trim()).filter(Boolean),
      model: String(body?.model || 'openrouter/auto'),
      image1Path: body?.image1Path || null,
      image2Path: body?.image2Path || null,
    });
    return new Response(JSON.stringify({ ok: true, post: result }), {
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
