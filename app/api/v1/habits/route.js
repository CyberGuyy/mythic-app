// The token API for habits.
//   GET  /api/v1/habits   today's habits and whether each is ticked
//   POST /api/v1/habits   { name } or { id } ticks that habit for today; { ..., on: false } unticks it
import { localToday } from '@/lib/day.js';
import { ensureHabits, habitsForDay, setHabitCheck } from '@/lib/simple/habits.js';
import { tokenRoute, need } from '@/lib/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = tokenRoute(async (body, request, db) => {
  ensureHabits(db);
  return { day: localToday(), habits: habitsForDay(db, localToday()).map(({ id, name, time_of_day, checked, streak }) => ({ id, name, time_of_day, checked, streak })) };
});

export const POST = tokenRoute(async (body, request, db) => {
  ensureHabits(db);
  const today = localToday();
  const habits = habitsForDay(db, today);
  const wanted = String(body.name || '').trim().toLowerCase();
  const habit = habits.find(item => item.id === body.id || (wanted && item.name.toLowerCase() === wanted));
  need(habit, 'No habit with that id or name. GET /api/v1/habits lists them.');
  return { ok: true, id: habit.id, day: today, checked: setHabitCheck(db, habit.id, today, body.on !== false) };
});
