import type { APIRoute } from 'astro';
import {
  json,
  getCookie,
  setCookie,
  newSignedUid,
  verifySignedUid,
  readLimit,
  nextUtcMidnightIso,
  handleOptions,
  corsHeaders,
  type Env,
} from '../../lib/reading-env';

export const prerender = false;

const onRequestGet: APIRoute = async ({ request, locals }) => {
  if (request.method === 'OPTIONS') return handleOptions(request);
  const env = (locals as { runtime?: { env?: Env } }).runtime?.env || ({} as Env);
  const secret = env.COOKIE_SECRET || 'dev-fallback-cookie-secret-change-me';
  let uid = await verifySignedUid(secret, getCookie(request, 'dt_uid'));
  let setCookieHeader: string | undefined;
  if (!uid) {
    const signed = await newSignedUid(secret);
    uid = signed.split('.')[0];
    setCookieHeader = setCookie('dt_uid', signed, 60 * 60 * 24 * 400);
  }
  const state = await readLimit(env, uid);
  const remaining = Math.max(0, 2 - state.rejections);
  const res = json(
    {
      remaining,
      accepted: state.accepted,
      day: state.day,
      resetAtIso: nextUtcMidnightIso(),
    },
    { headers: { ...corsHeaders(request.headers.get('origin')) } },
  );
  if (setCookieHeader) res.headers.append('set-cookie', setCookieHeader);
  return res;
};

const onRequestOptions: APIRoute = async ({ request }) => handleOptions(request);

export const GET = onRequestGet;
export const OPTIONS = onRequestOptions;