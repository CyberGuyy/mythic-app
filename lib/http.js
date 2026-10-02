// Route helpers. Every JSON route goes through jsonRoute: same-origin only,
// a JSON object in, a JSON object out, errors as { error } with a status.
// Sign-in is checked before any route runs (proxy.js); the token API
// (app/api/v1) checks its bearer token with tokenRoute instead.

export class RouteError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const MAX_BODY_BYTES = 256 * 1024;
const noStore = { 'Cache-Control': 'no-store' };

export const need = (condition, message, status = 400) => { if (!condition) throw new RouteError(message, status); };
/** Run a model call and turn its error into a 400 with the same words. */
export const wrap = call => { try { return call(); } catch (error) { throw error instanceof RouteError ? error : new RouteError(error.message); } };

/** A browser sends Origin on every cross-site POST. When it is there it must
 *  name this host, so another site cannot post into Mythic. */
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  let host;
  try { host = new URL(origin).host; } catch { throw new RouteError('Cross-site requests are refused.', 403); }
  const own = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (host !== own) throw new RouteError('Cross-site requests are refused.', 403);
}

export async function readJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new RouteError('Expected JSON', 415);
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new RouteError('That request is too large', 413);
  let body;
  try { body = JSON.parse(text || '{}'); } catch { throw new RouteError('Invalid JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RouteError('Send a JSON object');
  return body;
}

export function failure(error, fallback = 'That did not work') {
  const status = Number.isInteger(error?.status) ? error.status : 400;
  if (status >= 500) console.error(error);
  return Response.json({ error: error?.message || fallback }, { status, headers: noStore });
}

export const ok = (body, status = 200) => Response.json(body, { status, headers: noStore });

/** One JSON POST handler: same-origin, parsed body in, plain object out. */
export function jsonRoute(handler) {
  return async function route(request) {
    try {
      sameOrigin(request);
      const body = await readJson(request);
      return ok(await handler(body, request));
    } catch (error) {
      return failure(error);
    }
  };
}

/** One token API handler: the bearer token checked, then (body, request) in,
 *  plain object out. GET handlers get an empty body. */
export function tokenRoute(handler) {
  return async function route(request) {
    try {
      const [{ getDb }, { checkToken }, { applyProfile }] = await Promise.all([import('./db.js'), import('./connectors/token.js'), import('./profile.js')]);
      const db = getDb();
      if (!checkToken(db, request.headers.get('authorization'))) throw new RouteError('Send your Mythic API token as "Authorization: Bearer <token>". Make one on the Connections page.', 401);
      applyProfile(db);
      const body = request.method === 'GET' || request.method === 'HEAD' ? {} : await readJson(request);
      return ok(await handler(body, request, db));
    } catch (error) {
      return failure(error);
    }
  };
}
