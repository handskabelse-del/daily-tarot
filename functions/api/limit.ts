import type { Env } from './_shared';
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
  type PagesFunction,
} from './_shared';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return handleOptions(context.request);
  const env = context.env;
  const secret = env.COOKIE_SECRET || 'dev-fallback-cookie-secret-change-me';
  let uid = await verifySignedUid(secret, getCookie(context.request, 'dt_uid'));
  let setCookieHeader: string | undefined;
  if (!uid) {
    const signed = await newSignedUid(secret);
    uid = signed.split('.')[0];
    setCookieHeader = setCookie('dt_uid', signed, 60 * 60 * 24 * 400);
  }
  const state = await readLimit(env, uid);
  const remaining = Math.max(0, 2 - state.rejections);
  const res = json({
    remaining,
    accepted: state.accepted,
    day: state.day,
    resetAtIso: nextUtcMidnightIso(),
  }, { headers: { ...corsHeaders(context.request.headers.get('origin')) } });
  if (setCookieHeader) res.headers.append('set-cookie', setCookieHeader);
  return res;
};

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => handleOptions(request);
