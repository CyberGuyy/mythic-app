import { getDb } from '@/lib/db.js';
import { localToday } from '@/lib/day.js';
import { shiftDay, toggleHabitCheck } from '@/lib/simple/habits.js';
import { ensureFlower, ensureHabitIcons, setHabitIcon, setLook, startFresh } from '@/lib/dash/flower.js';
import { RouteError, jsonRoute } from '@/lib/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const need = (condition, message) => { if (!condition) throw new RouteError(message); };
const wrap = call => { try { return call(); } catch (error) { throw new RouteError(error.message); } };
const habitExists = (db, id) => !!db.prepare('SELECT 1 FROM habits WHERE id = ? AND active = 1').get(id);

// The flower lives only in SQLite (habits, habit_checks, flower_state), so
// these actions never touch the planning file.
export const POST = jsonRoute(async body => {
  const db = getDb();
  ensureHabitIcons(db);
  ensureFlower(db);
  const { action } = body;

  if (action === 'tick') {
    need(typeof body.habit_id === 'string' && body.habit_id, 'Name the habit to tick.');
    need(habitExists(db, body.habit_id), 'Habit not found.');
    // A habit can be logged for today or, when it was missed at the time,
    // for yesterday; nothing further back.
    need(body.day === undefined || body.day === 'yesterday', 'A habit can be ticked for today or yesterday only.');
    const day = body.day === 'yesterday' ? shiftDay(localToday(), -1) : localToday();
    const checked = wrap(() => toggleHabitCheck(db, body.habit_id, day, new Date()));
    return { ok: true, checked };
  }
  if (action === 'look') {
    // The colour, world or insect the flower shows, out of those already earned.
    const change = {};
    if ('tier' in body) change.tier = body.tier;
    if ('world' in body) change.world = body.world;
    if ('insect' in body) change.insect = body.insect;
    need(Object.keys(change).length, 'Say what to change: a colour, a world or an insect.');
    const look = wrap(() => setLook(db, change, localToday(), new Date()));
    return { ok: true, look };
  }
  if (action === 'icon') {
    need(typeof body.habit_id === 'string' && body.habit_id, 'Name the habit to change.');
    const icon = wrap(() => setHabitIcon(db, body.habit_id, body.icon ?? null));
    return { ok: true, icon };
  }
  if (action === 'fresh_start') {
    // Ticks before today stop counting: every petal starts blank again and a
    // habit is tracked from its next tick. No UI calls this; it is applied
    // through the API.
    const fresh_start = wrap(() => startFresh(db, localToday(), new Date()));
    return { ok: true, fresh_start };
  }
  throw new RouteError('Unknown action.');
});
