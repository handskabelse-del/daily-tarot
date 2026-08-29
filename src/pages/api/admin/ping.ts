import type { APIRoute } from 'astro';
import { getOpenRouterKey, getOpenRouterSiteUrl } from '../../../lib/admin-server';

export const prerender = false;

// GET /api/admin/ping?model=<id>
// Tiny 1-token preflight. Returns { ok, model, latencyMs, error? }.
// Used by the admin header dot so the user knows the *currently selected*
// model actually responds. Also doubles as a connectivity / key check.
export const GET: APIRoute = async ({ url }) => {
  const start = Date.now();
  const model = url.searchParams.get('model') || 'openrouter/auto';
  try {
    const key = getOpenRouterKey();
    if (!key) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing OpenRouter API key' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        'http-referer': getOpenRouterSiteUrl(),
        'x-title': 'Daily Tarot',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return new Response(JSON.stringify({ ok: false, model, latencyMs, error: `OpenRouter ${res.status}: ${text.slice(0, 160)}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, model, latencyMs }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return new Response(JSON.stringify({ ok: false, model, latencyMs, error: err?.message || String(err) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};