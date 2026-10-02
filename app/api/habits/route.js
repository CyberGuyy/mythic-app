import { getDb } from '@/lib/db.js';
import { localToday } from '@/lib/day.js';
import { ensureHabits, addHabit, updateHabit, deleteHabit, replaceHabit, checkHabitCount, setHabitCheck, toggleHabitCheck } from '@/lib/simple/habits.js';
import { RouteError, jsonRoute } from '@/lib/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const need = (condition, message) => { if (!condition) throw new RouteError(message); };
// Habits live only in SQLite, so these actions never touch the planning file
// and never take part in a revision conflict.
const wrap = call => { try { return call(); } catch (error) { throw new RouteError(error.message); } };

export const POST = jsonRoute(async body => {
  const db = getDb();
  ensureHabits(db);
  const { action } = body;

  if (action === 'add') {
    wrap(() => checkHabitCount(db, 'add'));
    const id = wrap(() => addHabit(db, { name: body.name, time_of_day: body.time_of_day, now: new Date() }));
    return { ok: true, id };
  }
  if (action === 'update') {
    need(typeof body.id === 'string' && body.id, 'Name the habit to change.');
    wrap(() => checkHabitCount(db, 'update', { id: body.id, active: body.active }));
    wrap(() => updateHabit(db, body.id, { name: body.name, time_of_day: body.time_of_day, active: body.active, now: new Date() }));
    return { ok: true };
  }
  if (action === 'delete') {
    need(typeof body.id === 'string' && body.id, 'Name the habit to delete.');
    wrap(() => checkHabitCount(db, 'delete', { id: body.id }));
    wrap(() => deleteHabit(db, body.id));
    return { ok: true };
  }
  // The habit count stays at HABIT_COUNT, so deleting one of them means
  // naming the habit that takes its place.
  if (action === 'replace') {
    need(typeof body.id === 'string' && body.id, 'Name the habit to replace.');
    wrap(() => checkHabitCount(db, 'replace', { id: body.id }));
    const id = wrap(() => replaceHabit(db, body.id, { name: body.name, time_of_day: body.time_of_day, now: new Date() }));
    return { ok: true, id };
  }
  if (action === 'check') {
    need(typeof body.id === 'string' && body.id, 'Name the habit to tick.');
    const day = body.day || localToday();
    const checked = wrap(() => body.on === undefined
      ? toggleHabitCheck(db, body.id, day, new Date())
      : setHabitCheck(db, body.id, day, !!body.on, new Date()));
    return { ok: true, checked };
  }
  throw new RouteError('Unknown action.');
});
