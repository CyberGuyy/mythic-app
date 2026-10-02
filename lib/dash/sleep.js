// Sleep: one row per night, keyed by the local day you woke up on. Bed and
// wake are wall times (HH:MM); a bedtime from 12:00 on is the evening before,
// one before 12:00 is after midnight on the waking day. Durations and the
// "up by the target" count are worked out from those two strings only, so a
// clock change or the machine's own timezone never moves a night.
import { ensureDashSettings, readSetting, writeSetting } from './settings.js';
import { shiftDay } from '../simple/habits.js';
import { localToday, wallTime, timeZone } from '../day.js';

export const DEFAULT_WAKE_TARGET = '08:00';
export const TARGET_KEY = 'sleep_wake_target';
export const MIN_MINUTES = 60;
export const MAX_MINUTES = 16 * 60;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const iso = value => (value instanceof Date ? value : new Date(value || Date.now())).toISOString();

export function ensureSleep(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS sleep_nights (
    day TEXT PRIMARY KEY, bed_at TEXT NOT NULL, woke_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  // source: 'manual' for a night typed here, 'apple_health' for one read from
  // the Health Shortcut (health-sleep.js), which also brings time asleep.
  const columns = new Set(db.prepare('PRAGMA table_info(sleep_nights)').all().map(column => column.name));
  if (!columns.has('source')) db.exec("ALTER TABLE sleep_nights ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  if (!columns.has('asleep_minutes')) db.exec('ALTER TABLE sleep_nights ADD COLUMN asleep_minutes INTEGER');
}

export const isTime = value => typeof value === 'string' && TIME.test(value);
export function isDay(value) {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const clockMinutes = time => { const [, h, m] = time.match(TIME); return Number(h) * 60 + Number(m); };

/** Minutes from midnight of the waking day: a bedtime from 12:00 on is the
 *  evening before, so it reads as negative (23:10 is -50). */
export const bedMinutes = bed => { const m = clockMinutes(bed); return m >= 720 ? m - 1440 : m; };
export const wakeMinutes = woke => clockMinutes(woke);

/** How long a night was, in whole minutes. */
export function nightMinutes(bed, woke) {
  if (!isTime(bed) || !isTime(woke)) throw new Error('Use HH:MM for the bed and wake times.');
  return wakeMinutes(woke) - bedMinutes(bed);
}


/** Whether you can already have woken at `woke` on the local day `day`:
 *  a later day is refused, and so is this morning's night before its wake
 *  time has come (logging 07:00 at 00:40 is a guess, not a night). */
export function morningReached(day, woke, now = new Date()) {
  const today = localToday(now);
  if (day !== today) return day < today;
  return !isTime(woke) || clockMinutes(woke) <= clockMinutes(wallTime(now));
}

/** The day the add-night line starts on: today, except before 04:00 local time,
 *  when last night's waking day has not come yet and yesterday is meant. */
export function defaultWakeDay(today, now = new Date()) {
  const hour = Number(wallTime(now).slice(0, 2));
  return hour < 4 ? shiftDay(today, -1) : today;
}

export function readWakeTarget(db) {
  ensureDashSettings(db);
  const target = readSetting(db, TARGET_KEY, DEFAULT_WAKE_TARGET);
  return isTime(target) ? target : DEFAULT_WAKE_TARGET;
}

export function writeWakeTarget(db, target, now) {
  if (!isTime(target)) throw new Error('Use HH:MM for the wake target.');
  ensureDashSettings(db);
  writeSetting(db, TARGET_KEY, target, now);
  return target;
}

/** Add a night, or replace the one already logged for that day. */
export function upsertNight(db, { day, bed_at: bed, woke_at: woke, note = '', now } = {}) {
  if (!isDay(day)) throw new Error('Use a YYYY-MM-DD day for the night.');
  if (!isTime(bed) || !isTime(woke)) throw new Error('Use HH:MM for the bed and wake times.');
  const minutes = nightMinutes(bed, woke);
  if (minutes < MIN_MINUTES || minutes > MAX_MINUTES) throw new Error('A night runs between 1 and 16 hours.');
  if (note !== null && note !== undefined && typeof note !== 'string') throw new Error('Write the note as text.');
  ensureSleep(db);
  const at = iso(now);
  // A night typed or edited here is the user's and the Health import leaves it.
  db.prepare(`INSERT INTO sleep_nights (day, bed_at, woke_at, note, source, asleep_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, 'manual', NULL, ?, ?)
    ON CONFLICT(day) DO UPDATE SET bed_at = excluded.bed_at, woke_at = excluded.woke_at, note = excluded.note, source = 'manual', asleep_minutes = NULL, updated_at = excluded.updated_at`)
    .run(day, bed, woke, String(note ?? '').trim().slice(0, 500), at, at);
  return { day, bed_at: bed, woke_at: woke, minutes };
}

// minutes is time asleep when Apple Health gave it, else bed to wake.
const shape = (row, target) => {
  const span = nightMinutes(row.bed_at, row.woke_at);
  const asleep = Number.isSafeInteger(row.asleep_minutes) && row.asleep_minutes > 0 ? row.asleep_minutes : null;
  return { day: row.day, bed_at: row.bed_at, woke_at: row.woke_at, note: row.note || '', minutes: asleep ?? span, in_bed_minutes: span, source: row.source || 'manual', on_time: wakeMinutes(row.woke_at) <= clockMinutes(target) };
};

/** The nights logged in the `days` local days up to `today`, oldest first. */
export function listNights(db, { days = 12, today, target = DEFAULT_WAKE_TARGET } = {}) {
  if (!isDay(today)) throw new Error('Use a YYYY-MM-DD day for today.');
  ensureSleep(db);
  const from = shiftDay(today, -(days - 1));
  return db.prepare('SELECT day, bed_at, woke_at, note, source, asleep_minutes FROM sleep_nights WHERE day >= ? AND day <= ? ORDER BY day')
    .all(from, today).map(row => shape(row, target));
}

/** The figures the widget shows: the window of nights, the average, how many
 *  mornings met the target, and the most recent night logged at all. */
export function sleepSummary(db, { today, days = 12 } = {}) {
  const target = readWakeTarget(db);
  const nights = listNights(db, { days, today, target });
  const lastRow = db.prepare('SELECT day, bed_at, woke_at, note, source, asleep_minutes FROM sleep_nights WHERE day <= ? ORDER BY day DESC LIMIT 1').get(today);
  return {
    days: Array.from({ length: days }, (_, index) => shiftDay(today, index - (days - 1))),
    nights,
    average_minutes: nights.length ? Math.round(nights.reduce((sum, night) => sum + night.minutes, 0) / nights.length) : null,
    on_time_count: nights.filter(night => night.on_time).length,
    last: lastRow ? shape(lastRow, target) : null,
    target,
    today,
  };
}

/** The Dash loader. */
export const loadSleep = async ({ db, today, now }) => {
  // Pull in the Apple Health file first when it changed (a stat otherwise).
  const status = (await import('./health-sleep.js')).importHealthSleep(db, { now: now || new Date() });
  const health = { found: Boolean(status.found), imported_at: status.imported_at || null, last_night: status.last_night || null, error: status.found ? status.error || null : null };
  return { ...sleepSummary(db, { today }), log_day: defaultWakeDay(today, now), health };
};
