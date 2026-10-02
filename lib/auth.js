// Who may open Mythic. Without MYTHIC_PASSWORD it answers only on this
// machine (localhost), which is how a personal app on a laptop should be.
// With MYTHIC_PASSWORD set it answers anywhere, behind a sign-in page and a
// signed session cookie. The token API (/api/v1) checks its own bearer token.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'mythic_session';
export const SESSION_DAYS = 30;
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/i;

export const password = (env = process.env) => (typeof env.MYTHIC_PASSWORD === 'string' && env.MYTHIC_PASSWORD.length ? env.MYTHIC_PASSWORD : null);

/** The key sessions are signed with: MYTHIC_SECRET, else one derived from the
 *  password, so changing the password signs everyone out. */
function key(env = process.env) {
  if (env.MYTHIC_SECRET) return env.MYTHIC_SECRET;
  return createHash('sha256').update('mythic-session:' + (password(env) || '')).digest('hex');
}

const sign = (value, env) => createHmac('sha256', key(env)).update(value).digest('base64url');

function same(a, b) {
  const left = Buffer.from(String(a)), right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

export const isLocalHost = host => LOCAL.test(String(host || ''));

/** A session cookie value: when it was made and its signature. */
export function newSession(now = Date.now(), env = process.env) {
  const issued = String(Math.floor(now / 1000));
  return issued + '.' + sign('session:' + issued, env);
}

export function validSession(value, now = Date.now(), env = process.env) {
  const [issued, signature] = String(value || '').split('.');
  if (!/^\d+$/.test(issued || '') || !signature) return false;
  if (now / 1000 - Number(issued) > SESSION_DAYS * 86400) return false;
  return same(signature, sign('session:' + issued, env));
}

export function checkPassword(attempt, env = process.env) {
  const real = password(env);
  if (!real) return false;
  // Compare digests so the length of the password leaks nothing.
  const digest = value => createHash('sha256').update(String(value)).digest('hex');
  return same(digest(attempt), digest(real));
}
