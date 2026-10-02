// Connections: the profile and every connector's switches, one action each.
import { getDb } from '@/lib/db.js';
import { writeProfile } from '@/lib/profile.js';
import { addFeed, removeFeed, refreshFeed } from '@/lib/connectors/calendar.js';
import { connectTelegram, disconnectTelegram, sendTelegram } from '@/lib/connectors/telegram.js';
import { issueToken, revokeToken } from '@/lib/connectors/token.js';
import { jsonRoute, need, RouteError } from '@/lib/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = jsonRoute(async body => {
  const db = getDb();
  const id = () => { need(typeof body.id === 'string' && body.id, 'Name the calendar.'); return body.id; };
  try {
    switch (body.action) {
      case 'profile': writeProfile(db, { name: body.name, timezone: body.timezone }); return { ok: true };
      case 'calendar_add': {
        const feed = addFeed(db, { name: body.name, url: body.url });
        return { ok: true, id: feed, result: await refreshFeed(db, feed) };
      }
      case 'calendar_remove': removeFeed(db, id()); return { ok: true };
      case 'calendar_refresh': return { ok: true, result: await refreshFeed(db, id()) };
      case 'telegram_connect': return { ok: true, status: await connectTelegram(db, body.token) };
      case 'telegram_disconnect': disconnectTelegram(db); return { ok: true };
      case 'telegram_test': await sendTelegram(db, 'Mythic can reach you here.'); return { ok: true };
      case 'token_issue': return { ok: true, token: issueToken(db) };
      case 'token_revoke': revokeToken(db); return { ok: true };
      default: throw new RouteError('Unknown action.');
    }
  } catch (error) {
    throw error instanceof RouteError ? error : new RouteError(error.message);
  }
});
