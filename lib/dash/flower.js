// The habit flower: one petal per habit (five), drawn by
// components/dash/widgets/Flower.jsx with components/dash/bloom/draw.js from
// what flowerView() returns here. Everything comes from the ticks in
// habit_checks, replayed day by day through lib/dash/bloom-rules.js: each
// petal's growth, tears and rot, the colour reached and the one complete, good
// days toward the next colour, thriving days and what they unlocked. One
// flower_state row keeps the rest: the day counting started (fresh_start) and
// your look (the colour, world and insect he picked).
import { ensureHabits, listHabits, habitStreak, shiftDay } from '../simple/habits.js';
import { HABIT_ICONS, defaultHabitIcon } from './flower-icons.js';
import { STYLES } from './flower-rules.js';
import { TIER_DAYS, TOP_TIER, WORLD_ORDER, dayNum, growIn, ladderAt, progress, stateAt } from './bloom-rules.js';
import { localToday } from '../day.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const iso = value => (value instanceof Date ? value : new Date(value || Date.now())).toISOString();
/** Whole days from a to b (both YYYY-MM-DD). */
export const daysBetween = (a, b) => dayNum(b) - dayNum(a);
/** petals on the flower */
export const PETALS = 5;
/** the longest history replayed, in days */
const SPAN = 730;
/** insect options per colour (components/dash/bloom/scenery.js INSECT_OPTIONS) */
export const INSECT_CHOICES = [3, 3, 3, 3, 3, 4];
/** the insects you picked in the design artifact: the Swallowtail on Jade, the first option elsewhere */
const PICKED = [0, 0, 0, 1, 0, 0];

export function ensureFlower(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS flower_state (id TEXT PRIMARY KEY, style INTEGER NOT NULL, prev INTEGER NOT NULL, seep_started_day TEXT, bush INTEGER NOT NULL, upgraded_day TEXT, json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)`);
  db.prepare("INSERT OR IGNORE INTO flower_state (id, style, prev, seep_started_day, bush, upgraded_day, json, updated_at) VALUES ('main', 0, 0, NULL, 0, NULL, '{}', ?)").run(iso());
}

/** habits.icon: the line icon you picked for a habit, null until he does. */
export function ensureHabitIcons(db) {
  ensureHabits(db);
  const columns = db.prepare('PRAGMA table_info(habits)').all().map(column => column.name);
  if (!columns.includes('icon')) db.exec('ALTER TABLE habits ADD COLUMN icon TEXT');
}

export function setHabitIcon(db, id, icon) {
  ensureHabitIcons(db);
  if (icon !== null && !HABIT_ICONS.includes(icon)) throw new Error('Pick one of the habit icons.');
  const result = db.prepare('UPDATE habits SET icon = ? WHERE id = ?').run(icon, id);
  if (!result.changes) throw new Error('Habit not found.');
  return icon;
}

function readExtra(db) {
  ensureFlower(db);
  const row = db.prepare("SELECT json FROM flower_state WHERE id = 'main'").get();
  try { return JSON.parse(row.json || '{}') || {}; } catch { return {}; }
}
function writeExtra(db, extra, now) {
  db.prepare("UPDATE flower_state SET json = ?, updated_at = ? WHERE id = 'main'").run(JSON.stringify(extra), iso(now));
}

/** The look as stored: tier and world are null for "the newest one", insects one option per colour. */
function lookOf(extra) {
  const look = extra.look || {};
  const insects = INSECT_CHOICES.map((n, t) => Number.isInteger(look.insects?.[t]) && look.insects[t] >= 0 && look.insects[t] < n ? look.insects[t] : PICKED[t]);
  return {
    tier: Number.isInteger(look.tier) && look.tier >= 0 && look.tier <= TOP_TIER ? look.tier : null,
    world: WORLD_ORDER.includes(look.world) ? look.world : null,
    insects,
  };
}

export function readFlower(db) {
  const extra = readExtra(db);
  return { fresh_start: DAY.test(extra.fresh_start || '') ? extra.fresh_start : null, look: lookOf(extra) };
}

/** Counting starts again on `day`: ticks before it no longer count for the
 *  petals, the colours or thriving. The ticks themselves stay. null clears it. */
export function startFresh(db, day, now = new Date()) {
  if (day !== null && !DAY.test(day ?? '')) throw new Error('Use a YYYY-MM-DD day.');
  const extra = readExtra(db);
  if (day === null) delete extra.fresh_start; else extra.fresh_start = day;
  writeExtra(db, extra, now);
  return day;
}

/** Start every habit from scratch: delete all their ticks and count from
 *  `day`. The habits, their names and icons, and the look stay. */
export function resetHabits(db, day, now = new Date()) {
  if (!DAY.test(day ?? '')) throw new Error('Use a YYYY-MM-DD day.');
  ensureHabitIcons(db);
  const run = db.transaction(() => {
    const removed = db.prepare('DELETE FROM habit_checks').run().changes;
    startFresh(db, day, now);
    return removed;
  });
  return { removed: run(), fresh_start: day };
}

/** Change the look: { tier } a colour already complete or null for the
 *  newest, { world } one already unlocked or null for the newest, { insect:
 *  { tier, index } } a colour's insect. Refused past what has been earned. */
export function setLook(db, change, today = localToday(), now = new Date()) {
  const view = flowerView(db, today), done = view.state.done, extra = readExtra(db), look = lookOf(extra);
  if ('tier' in change) {
    if (change.tier !== null && !(Number.isInteger(change.tier) && change.tier >= 0 && change.tier <= done)) throw new Error('That colour has not grown in yet.');
    look.tier = change.tier;
  }
  if ('world' in change) {
    if (change.world !== null && !view.state.worlds.includes(change.world)) throw new Error('That world has not been unlocked yet.');
    look.world = change.world;
  }
  if ('insect' in change) {
    const { tier, index } = change.insect || {};
    if (!(Number.isInteger(tier) && tier >= 0 && tier <= done)) throw new Error('That colour has not grown in yet.');
    if (!(Number.isInteger(index) && index >= 0 && index < INSECT_CHOICES[tier])) throw new Error('Pick one of that colour\'s insects.');
    look.insects[tier] = index;
  }
  extra.look = look;
  writeExtra(db, extra, now);
  return look;
}

/** The active habits in list order with their icon (picked, else one chosen from the name). */
export function habitsWithIcons(db) {
  ensureHabitIcons(db);
  const icons = new Map(db.prepare('SELECT id, icon FROM habits').all().map(row => [row.id, row.icon]));
  return listHabits(db, { activeOnly: true }).map(habit => {
    const picked = icons.get(habit.id);
    return { ...habit, icon: HABIT_ICONS.includes(picked) ? picked : defaultHabitIcon(habit.name), icon_picked: HABIT_ICONS.includes(picked) };
  });
}

/** One tick string per habit from `start` to `today`: '1' ticked, '0' not,
 *  '-' before the habit's first tick (a habit starts on its first tick). */
export function tickRows(db, habits, start, today) {
  const D = daysBetween(start, today) + 1, ticks = new Map(habits.map(habit => [habit.id, new Set()]));
  for (const row of db.prepare('SELECT habit_id, day FROM habit_checks WHERE day >= ? AND day <= ?').all(start, today)) ticks.get(row.habit_id)?.add(row.day);
  return habits.map(habit => {
    const set = ticks.get(habit.id), chars = [];
    let started = false;
    for (let x = 0; x < D; x++) { const on = set.has(shiftDay(start, x)); started = started || on; chars.push(on ? '1' : started ? '0' : '-'); }
    return chars.join('');
  });
}

/** Everything the flower and its caption need, as plain JSON. */
export function flowerView(db, today = localToday()) {
  ensureFlower(db);
  const habits = habitsWithIcons(db).slice(0, PETALS);
  const flower = readFlower(db);
  let start = flower.fresh_start;
  if (!start) {
    const first = db.prepare('SELECT MIN(day) AS day FROM habit_checks WHERE day <= ?').get(today)?.day;
    start = first || today;
  }
  if (daysBetween(start, today) > SPAN) start = shiftDay(today, -SPAN);
  if (start > today) start = today;
  const rows = tickRows(db, habits, start, today), D = daysBetween(start, today) + 1, start0 = dayNum(start) - 1;
  const prog = progress(rows);
  const growing = prog.tier > prog.done, unlockAt = growing ? prog.unlocked[prog.tier] : null;
  return {
    habits: habits.map((habit, k) => {
      const row = rows[k], first = row.indexOf('1'), tracked = first >= 0;
      const ticks = tracked ? row.slice(first) : '', off = start0 + first;
      const petal = tracked ? stateAt(ticks, ticks.length, k, off) : null;
      return {
        id: habit.id, name: habit.name, time_of_day: habit.time_of_day, icon: habit.icon, icon_picked: habit.icon_picked,
        streak: habitStreak(db, habit.id, today),
        checked_today: row[D - 1] === '1', checked_yesterday: D > 1 && row[D - 2] === '1',
        tracked, since: tracked ? shiftDay(start, first) : null, dormant: false,
        // for the drawing: the tick string from the first tick, its day number before day 1, and today's state
        ticks, off,
        growth: petal ? petal.growth : 0, dead: !!petal?.dead, restart: !!petal?.restart,
        grow: growing && tracked ? growIn(ticks, unlockAt - first + 1, ticks.length) : 1,
      };
    }),
    state: {
      tier: prog.tier, done: prog.done, growing,
      tier_name: STYLES[prog.tier][0], done_name: STYLES[prog.done][0], next_name: prog.tier < TOP_TIER ? STYLES[prog.tier + 1][0] : null,
      unlocked_day: growing ? shiftDay(start, unlockAt) : null, unlock_index: unlockAt,
      good: prog.good, toward: prog.toward, need: TIER_DAYS, keep: prog.keep,
      thriving: prog.thriving, thriving_total: prog.thrivingTotal, thriving_streak: prog.streak,
      unlocks: ladderAt(prog.thrivingTotal).map(item => item.id),
      worlds: WORLD_ORDER.slice(0, prog.done + 1),
      look: flower.look, fresh_start: flower.fresh_start, start,
    },
    today,
  };
}
