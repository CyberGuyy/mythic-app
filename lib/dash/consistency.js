// The consistency map: the last four calendar weeks of project work, a row a
// week (Monday first) and a column a weekday, the last row holding today. Per
// local day, planned is the project tasks
// due that day (open or done) plus the project tasks completed that day, and
// done is the project tasks completed that day. The shade is done / planned.
import { shiftDay } from '../simple/habits.js';
import { localToday } from '../day.js';

export const WEEKS = 4;
const OPEN_OR_DONE = new Set(['ready', 'in_progress', 'waiting', 'done']);
const dated = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const weekday = day => new Date(day + 'T12:00:00Z').getUTCDay();   // 0 Sunday .. 6 Saturday

/** The Monday of the week holding `day`. */
export const mondayOf = day => shiftDay(day, -((weekday(day) + 6) % 7));

export function consistency(state, today = localToday(), weeks = WEEKS) {
  const start = shiftDay(mondayOf(today), -7 * (weeks - 1));
  const planned = new Map(), done = new Map();
  const add = (map, day, id) => { if (!map.has(day)) map.set(day, new Set()); map.get(day).add(id); };
  for (const task of Object.values(state?.tasks_by_id || {})) {
    if (!task || typeof task.project_id !== 'string' || !task.project_id) continue;
    if (OPEN_OR_DONE.has(task.status) && dated(task.due_at)) add(planned, localToday(new Date(task.due_at)), task.id);
    if (task.status === 'done' && dated(task.completed_at)) {
      const day = localToday(new Date(task.completed_at));
      add(planned, day, task.id);
      add(done, day, task.id);
    }
  }
  const out = [];
  let workdays = 0, moved = 0, run = 0, best = 0;
  for (let w = 0; w < weeks; w += 1) {
    const row = [];
    for (let d = 0; d < 7; d += 1) {
      const day = shiftDay(start, w * 7 + d);
      if (day > today) { row.push({ day, planned: 0, done: 0, v: 0, future: true }); continue; }
      const p = planned.get(day)?.size || 0, n = done.get(day)?.size || 0;
      row.push({ day, planned: p, done: n, v: p ? Math.min(1, n / p) : 0 });
      if (d < 5) { workdays += 1; if (n > 0) moved += 1; }
      run = n > 0 ? run + 1 : 0;
      best = Math.max(best, run);
    }
    out.push(row);
  }
  return { weeks: out, share_pct: workdays ? Math.round(moved / workdays * 100) : 0, best_run: best, today };
}
