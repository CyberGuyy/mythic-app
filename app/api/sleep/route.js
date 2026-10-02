// Sleep: log or correct a night, and set the wake target. Local-only JSON
// through jsonRoute; errors come back as { error } with a status.
import { getDb } from '@/lib/db.js';
import { upsertNight, writeWakeTarget, isDay, isTime, nightMinutes, morningReached, MIN_MINUTES, MAX_MINUTES } from '@/lib/dash/sleep.js';
import { RouteError, jsonRoute } from '@/lib/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const need = (condition, message) => { if (!condition) throw new RouteError(message); };
const wrap = call => { try { return call(); } catch (error) { throw new RouteError(error.message); } };

export const POST = jsonRoute(async body => {
  const db = getDb();
  const now = new Date();
  const { action } = body;

  if (action === 'night') {
    need(isDay(body.day), 'Choose the day you woke up, as YYYY-MM-DD.');
    need(isTime(body.bed_at), 'Write the bedtime as HH:MM.');
    need(isTime(body.woke_at), 'Write the wake time as HH:MM.');
    need(morningReached(body.day, body.woke_at, now), 'That morning has not happened yet.');
    const minutes = nightMinutes(body.bed_at, body.woke_at);
    need(minutes >= MIN_MINUTES && minutes <= MAX_MINUTES, 'A night runs between 1 and 16 hours.');
    need(body.note === undefined || body.note === null || typeof body.note === 'string', 'Write the note as text.');
    const night = wrap(() => upsertNight(db, { day: body.day, bed_at: body.bed_at, woke_at: body.woke_at, note: body.note || '', now }));
    return { ok: true, night };
  }

  if (action === 'target') {
    need(isTime(body.wake_target), 'Write the wake target as HH:MM.');
    return { ok: true, wake_target: wrap(() => writeWakeTarget(db, body.wake_target, now)) };
  }

  throw new RouteError('Unknown action.');
});
