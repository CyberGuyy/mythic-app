// Sign in with MYTHIC_PASSWORD; sign out with { action: 'logout' }.
import { cookies } from 'next/headers';
import { COOKIE, SESSION_DAYS, checkPassword, newSession, password } from '@/lib/auth.js';
import { jsonRoute, RouteError } from '@/lib/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// A few wrong passwords in a row slow the next attempts down.
let failures = 0, lastFailure = 0;

export const POST = jsonRoute(async (body, request) => {
  const jar = await cookies();
  if (body.action === 'logout') { jar.delete(COOKIE); return { ok: true }; }
  if (!password()) throw new RouteError('Sign-in is off: Mythic is only open on this machine.');
  if (failures >= 5 && Date.now() - lastFailure < 30000) throw new RouteError('Too many tries. Wait half a minute.', 429);
  if (!checkPassword(body.password)) {
    failures += 1; lastFailure = Date.now();
    await new Promise(resolve => setTimeout(resolve, 400));
    throw new RouteError('That password is not right.', 401);
  }
  failures = 0;
  const secure = request.headers.get('x-forwarded-proto') === 'https' || new URL(request.url).protocol === 'https:';
  jar.set(COOKIE, newSession(), { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_DAYS * 86400 });
  return { ok: true };
});
