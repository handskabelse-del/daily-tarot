import type { Env } from './_shared';
import {
  json,
  getCookie,
  setCookie,
  newSignedUid,
  verifySignedUid,
  readLimit,
  writeLimit,
  todayUtc,
  nextUtcMidnightIso,
  handleOptions,
  corsHeaders,
  type PagesFunction,
} from './_shared';
import { drawNine, POSITIONS } from '../../src/lib/draw';
import { getSystemPrompt, buildUserPrompt, parseReadingJson, fallbackReading, type ReadingJson } from '../../src/lib/prompts';

type Body = {
  openrouterKey?: string;
  question?: string;
  action?: 'draw' | 'reject' | 'accept';
  locale?: string;
  cardFingerprint?: string;
};

const MAX_KEY_LEN = 256;
const MAX_QUESTION_LEN = 500;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return handleOptions(context.request);
  const env = context.env;
  const origin = context.request.headers.get('origin');

  if (env.READINGS_PAUSED === 'true' || env.READINGS_PAUSED === '1') {
    return json(
      { error: 'Daily readings are temporarily paused', paused: true },
      { status: 503, headers: corsHeaders(origin) },
    );
  }

  const secret = env.COOKIE_SECRET || 'dev-fallback-cookie-secret-change-me';

  let body: Body = {};
  try {
    const raw = await context.request.text();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Body;
        body = parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        const url = new URL(context.request.url);
        const qAction = url.searchParams.get('action');
        if (qAction === 'draw' || qAction === 'reject' || qAction === 'accept') {
          body = { action: qAction };
        }
        if (!body.action) {
          return json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders(origin) });
        }
      }
    } else {
      const url = new URL(context.request.url);
      const qAction = url.searchParams.get('action');
      if (qAction === 'draw' || qAction === 'reject' || qAction === 'accept') {
        body = { action: qAction };
      }
    }
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders(origin) });
  }

  // Prefer the server-side key (billed to site owner). User-supplied key is optional override.
  const serverKey = (env.OPENROUTER_DEFAULT_KEY || '').trim();
  const userKey = (body.openrouterKey || '').trim().slice(0, MAX_KEY_LEN);
  if (userKey && !/^sk-or-/.test(userKey)) {
    return json({ error: 'OpenRouter key must start with sk-or-' }, { status: 400, headers: corsHeaders(origin) });
  }
  const activeKey = serverKey || userKey;
  const keySource: 'server' | 'user' | 'none' = serverKey ? 'server' : userKey ? 'user' : 'none';
  const question = (body.question || '').slice(0, MAX_QUESTION_LEN);
  const locale = (body.locale || 'en').toString().slice(0, 5);
  const url = new URL(context.request.url);
  const useFallback = url.searchParams.get('fallback') === '1';

  let uid = await verifySignedUid(secret, getCookie(context.request, 'dt_uid'));
  let setCookieHeader: string | undefined;
  if (!uid) {
    const signed = await newSignedUid(secret);
    uid = signed.split('.')[0];
    setCookieHeader = setCookie('dt_uid', signed, 60 * 60 * 24 * 400);
  }

  const state = await readLimit(env, uid);

  // ---- Guards ----
  // Reject path: only allowed if the user has < 2 rejects and hasn't accepted.
  if (body.action === 'reject' && (state.rejections >= 2 || state.accepted)) {
    const res = json(
      { error: 'Daily limit reached', resetAtIso: nextUtcMidnightIso(), accepted: state.accepted },
      { status: 429, headers: corsHeaders(origin) },
    );
    if (setCookieHeader) res.headers.append('set-cookie', setCookieHeader);
    return res;
  }

  // Accept path: just record the fingerprint, no draw.
  if (body.action === 'accept') {
    state.accepted = true;
    state.acceptedFingerprint = (body.cardFingerprint || '').slice(0, 128);
    state.day = todayUtc();
    await writeLimit(env, uid, state);
    const res = json(
      { ok: true, remaining: Math.max(0, 2 - state.rejections), resetAtIso: nextUtcMidnightIso() },
      { headers: corsHeaders(origin) },
    );
    if (setCookieHeader) res.headers.append('set-cookie', setCookieHeader);
    return res;
  }

  // Draw path: blocked once the user has accepted, OR has used both rejects.
  if (body.action !== 'reject') {
    if (state.accepted) {
      const res = json(
        { error: 'Reading already accepted for today', resetAtIso: nextUtcMidnightIso() },
        { status: 429, headers: corsHeaders(origin) },
      );
      if (setCookieHeader) res.headers.append('set-cookie', setCookieHeader);
      return res;
    }
    if (state.rejections >= 2) {
      const res = json(
        { error: 'Daily rejection limit reached', resetAtIso: nextUtcMidnightIso() },
        { status: 429, headers: corsHeaders(origin) },
      );
      if (setCookieHeader) res.headers.append('set-cookie', setCookieHeader);
      return res;
    }
  }

  const cards = drawNine();
  let reading: ReadingJson;
  let usedFallback = false;
  if (useFallback || !activeKey) {
    reading = fallbackReading(cards, locale);
    usedFallback = true;
  } else {
    try {
      reading = await callOpenRouter(env, activeKey, cards, question, locale);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (/invalid|auth|key|401|403/.test(msg)) {
        const res = json(
          { error: 'OpenRouter rejected the API key' },
          { status: 400, headers: corsHeaders(origin) },
        );
        if (setCookieHeader) res.headers.append('set-cookie', setCookieHeader);
        return res;
      }
      reading = fallbackReading(cards, locale);
      usedFallback = true;
    }
  }

  // Remap the returned position names back to canonical English keys so the
  // client can match them against the cards' `position.name`. Localized text
  // stays in the chosen language; only the position key is normalized.
  const canonicalByIndex: Record<number, string> = {};
  for (const p of POSITIONS) canonicalByIndex[p.index] = p.name;
  reading.positionInterpretations = reading.positionInterpretations.map((pi) => {
    const card = cards.find((c) => c.position.name === pi.position || c.position.index === Number(pi.position));
    if (card) return { ...pi, position: card.position.name };
    const idx = Number(pi.position);
    if (canonicalByIndex[idx]) return { ...pi, position: canonicalByIndex[idx] };
    return pi;
  });

  if (body.action === 'reject') {
    state.rejections += 1;
    state.lastDrawAt = Date.now();
  } else {
    state.lastDrawAt = Date.now();
  }
  state.day = todayUtc();
  await writeLimit(env, uid, state);

  const res = json(
    {
      cards: cards.map((c) => ({
        id: c.id,
        card: { id: c.card.id, name: c.card.name, arcana: c.card.arcana, suit: c.card.suit, keywords: c.card.keywords },
        orientation: c.orientation,
        position: c.position,
      })),
      reading,
      remaining: Math.max(0, 2 - state.rejections),
      accepted: state.accepted,
      resetAtIso: nextUtcMidnightIso(),
      usedFallback,
      keySource,
    },
    { headers: corsHeaders(origin) },
  );
  if (setCookieHeader) res.headers.append('set-cookie', setCookieHeader);
  return res;
};

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => handleOptions(request);

async function callOpenRouter(env: Env, key: string, cards: ReturnType<typeof drawNine>, question: string, locale: string): Promise<ReadingJson> {
  const model = env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-lightning:free';
  const referer = env.SITE_URL || 'https://dailytarot.example.com';
  const controller = new AbortController();
  // 30s budget — enough for slow free models, not enough to hang the user.
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        'http-referer': referer,
        'x-title': 'Daily Tarot',
      },
      body: JSON.stringify({
        model,
        // No response_format: many non-OpenAI-family models on OpenRouter don't
        // honor json_object. We instruct the model to return only JSON via the
        // system prompt, and parse defensively on the server.
        messages: [
          { role: 'system', content: getSystemPrompt(locale) },
          { role: 'user', content: buildUserPrompt(cards, question, locale) },
        ],
        temperature: 0.9,
        max_tokens: 1800,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenRouter returned no content');
    return parseReadingJson(content);
  } finally {
    clearTimeout(timeout);
  }
}
