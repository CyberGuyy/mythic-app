// Habits: a short list you edit yourself, and one tick per habit per local
// day. Streaks are counted from the day strings, never from timestamps, so a
// clock change or a machine in another timezone cannot move a day boundary.
// Goals are a different thing and are not touched here.
import { randomUUID } from 'node:crypto';
import { localToday } from '../day.js';

export const TIMES_OF_DAY = ['morning', 'afternoon', 'evening'];
const ORDER = { morning: 0, afternoon: 1, evening: 2 };
const iso = value => (value instanceof Date ? value : new Date(value || Date.now())).toISOString();
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Walk a YYYY-MM-DD by whole days. Midday UTC keeps the arithmetic clear of
 *  every daylight-saving edge, and only the date part is ever read back. */
export function shiftDay(day, delta) {
  if (!DAY.test(day)) throw new Error('Use a YYYY-MM-DD day.');
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function ensureHabits(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS habits (id TEXT PRIMARY KEY, name TEXT NOT NULL, time_of_day TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS habit_checks (habit_id TEXT NOT NULL REFERENCES habits(id), day TEXT NOT NULL, checked_at TEXT NOT NULL, PRIMARY KEY (habit_id, day));
    CREATE INDEX IF NOT EXISTS idx_habit_checks_day ON habit_checks(day);
  `);
}

function cleanName(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('Give the habit a name.');
  return name.slice(0, 120);
}
function cleanTime(value) {
  if (!TIMES_OF_DAY.includes(value)) throw new Error('Choose morning, afternoon or evening.');
  return value;
}
function cleanDay(value) {
  if (!DAY.test(value ?? '')) throw new Error('Use a YYYY-MM-DD day.');
  return value;
}

export function addHabit(db, { name, time_of_day: timeOfDay, now } = {}) {
  const id = randomUUID(), at = iso(now);
  db.prepare('INSERT INTO habits (id, name, time_of_day, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
    .run(id, cleanName(name), cleanTime(timeOfDay), at, at);
  return id;
}

export function updateHabit(db, id, { name, time_of_day: timeOfDay, active, now } = {}) {
  const row = db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
  if (!row) throw new Error('Habit not found.');
  db.prepare('UPDATE habits SET name = ?, time_of_day = ?, active = ?, updated_at = ? WHERE id = ?').run(
    name === undefined ? row.name : cleanName(name),
    timeOfDay === undefined ? row.time_of_day : cleanTime(timeOfDay),
    active === undefined ? row.active : (active ? 1 : 0),
    iso(now), id);
}

export function deleteHabit(db, id) {
  db.transaction(() => {
    db.prepare('DELETE FROM habit_checks WHERE habit_id = ?').run(id);
    db.prepare('DELETE FROM habits WHERE id = ?').run(id);
  })();
}

/** Replace a habit with a new one in one step: the old habit and its ticks go,
 *  the new one starts with none. Returns the new habit's id. */
export function replaceHabit(db, id, { name, time_of_day: timeOfDay, now } = {}) {
  return db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM habits WHERE id = ?').get(id)) throw new Error('Habit not found.');
    deleteHabit(db, id);
    return addHabit(db, { name, time_of_day: timeOfDay, now });
  })();
}

// You keep exactly HABIT_COUNT active habits, one petal each on the Dash
// flower. A new habit only fills a gap, a delete or a pause only trims a
// surplus, and any other change is a replace. The routes call
// checkHabitCount before they write; the functions above stay unrestricted.
export const HABIT_COUNT = 5;
export const FULL_LINE = `You keep ${HABIT_COUNT} habits. Replace one instead of adding another.`;
export const KEEP_LINE = `You keep ${HABIT_COUNT} habits. Replace this one instead of deleting it.`;
export const PAUSE_LINE = `You keep ${HABIT_COUNT} habits. Replace this one instead of pausing it.`;

export const countActiveHabits = db => db.prepare('SELECT COUNT(*) AS n FROM habits WHERE active = 1').get().n;

/** Throws when `action` (add, delete, replace or update with `active`) on
 *  habit `id` would leave more or fewer than HABIT_COUNT active habits. */
export function checkHabitCount(db, action, { id, active } = {}) {
  const count = countActiveHabits(db);
  if (action === 'add') { if (count >= HABIT_COUNT) throw new Error(FULL_LINE); return; }
  const row = id ? db.prepare('SELECT active FROM habits WHERE id = ?').get(id) : null;
  if (!row) return; // the write itself reports a missing habit
  const on = !!row.active;
  if (action === 'delete' && on && count <= HABIT_COUNT) throw new Error(KEEP_LINE);
  if (action === 'replace' && !on && count >= HABIT_COUNT) throw new Error(FULL_LINE);
  if (action === 'update' && active !== undefined) {
    if (on && !active && count <= HABIT_COUNT) throw new Error(PAUSE_LINE);
    if (!on && active && count >= HABIT_COUNT) throw new Error(FULL_LINE);
  }
}

const shape = row => ({ id: row.id, name: row.name, time_of_day: row.time_of_day, active: !!row.active, created_at: row.created_at });

export function listHabits(db, { activeOnly = false } = {}) {
  const rows = activeOnly
    ? db.prepare('SELECT * FROM habits WHERE active = 1').all()
    : db.prepare('SELECT * FROM habits').all();
  return rows.map(shape).sort((a, b) => ORDER[a.time_of_day] - ORDER[b.time_of_day] || a.name.localeCompare(b.name));
}

export function setHabitCheck(db, id, day, on, now) {
  const key = cleanDay(day);
  if (on) db.prepare('INSERT OR REPLACE INTO habit_checks (habit_id, day, checked_at) VALUES (?, ?, ?)').run(id, key, iso(now));
  else db.prepare('DELETE FROM habit_checks WHERE habit_id = ? AND day = ?').run(id, key);
  return !!on;
}

export function toggleHabitCheck(db, id, day, now) {
  const key = cleanDay(day);
  const has = !!db.prepare('SELECT 1 FROM habit_checks WHERE habit_id = ? AND day = ?').get(id, key);
  return setHabitCheck(db, id, key, !has, now);
}

function checkedDays(db, id) {
  return new Set(db.prepare('SELECT day FROM habit_checks WHERE habit_id = ?').all(id).map(row => row.day));
}

export function habitStreak(db, id, today = localToday()) {
  const days = checkedDays(db, id);
  if (!days.size) return 0;
  // The current day is not over, so a streak may end today or yesterday.
  let cursor = days.has(cleanDay(today)) ? today : shiftDay(today, -1);
  let streak = 0;
  while (days.has(cursor)) { streak += 1; cursor = shiftDay(cursor, -1); }
  return streak;
}

export function habitDots(db, id, today = localToday(), days = 14) {
  const checked = checkedDays(db, id);
  const out = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    const day = shiftDay(cleanDay(today), -back);
    out.push({ day, checked: checked.has(day) });
  }
  return out;
}

export function habitsForDay(db, today = localToday()) {
  const day = cleanDay(today);
  const ticked = new Set(db.prepare('SELECT habit_id FROM habit_checks WHERE day = ?').all(day).map(row => row.habit_id));
  return listHabits(db, { activeOnly: true }).map(habit => ({ ...habit, checked: ticked.has(habit.id), streak: habitStreak(db, habit.id, day) }));
}
