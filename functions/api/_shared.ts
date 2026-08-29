export interface Env {
  DAILY_TAROT_KV?: KVNamespace;
  COOKIE_SECRET?: string;
  SITE_URL?: string;
  OPENROUTER_DEFAULT_KEY?: string;
  OPENROUTER_MODEL?: string;
  ALLOW_FREE_FALLBACK?: string;
  READINGS_PAUSED?: string;
}

export interface PagesContext<E = unknown> {
  request: Request;
  env: E;
  params: Record<string, string>;
  waitUntil: (promise: Promise<unknown>) => void;
  passThroughOnException: () => void;
  next?: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  data?: Record<string, unknown>;
}

export type PagesFunction<E = unknown> = (context: PagesContext<E>) => Response | Promise<Response>;

export type LimitState = {
  day: string;
  rejections: number;
  lastDrawAt: number;
  accepted: boolean;
  // A short fingerprint of the cards the user last accepted (e.g. first 3 card ids joined).
  // Used to make a "draw again with the same cards" request cheap to detect.
  acceptedFingerprint: string;
};

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nextUtcMidnightIso(): string {
  const d = new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0));
  return next.toISOString();
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

export function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function setCookie(name: string, value: string, maxAgeSec: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; Secure; SameSite=Lax`;
}

async function hmacSign(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function newSignedUid(secret: string): Promise<string> {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  const id = Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const sig = (await hmacSign(secret, id)).slice(0, 32);
  return `${id}.${sig}`;
}

export async function verifySignedUid(secret: string, value: string | null): Promise<string | null> {
  if (!value) return null;
  const [id, sig] = value.split('.');
  if (!id || !sig) return null;
  const expected = (await hmacSign(secret, id)).slice(0, 32);
  if (expected !== sig) return null;
  return id;
}

export async function readLimit(env: Env, uid: string): Promise<LimitState> {
  const key = `limit:${uid}`;
  const raw = env.DAILY_TAROT_KV ? await env.DAILY_TAROT_KV.get(key) : null;
  const empty: LimitState = { day: todayUtc(), rejections: 0, lastDrawAt: 0, accepted: false, acceptedFingerprint: '' };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<LimitState>;
    if (parsed.day !== todayUtc()) return empty;
    return {
      day: todayUtc(),
      rejections: Number(parsed.rejections) || 0,
      lastDrawAt: Number(parsed.lastDrawAt) || 0,
      accepted: Boolean(parsed.accepted),
      acceptedFingerprint: typeof parsed.acceptedFingerprint === 'string' ? parsed.acceptedFingerprint : '',
    };
  } catch {
    return empty;
  }
}

export async function writeLimit(env: Env, uid: string, state: LimitState): Promise<void> {
  if (!env.DAILY_TAROT_KV) return;
  const key = `limit:${uid}`;
  await env.DAILY_TAROT_KV.put(key, JSON.stringify(state));
}

export function corsHeaders(origin?: string | null): HeadersInit {
  const allow = origin || '*';
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'vary': 'Origin',
  };
}

export function handleOptions(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}
