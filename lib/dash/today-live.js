// The live half of the Today widget: given the day's items (from the loader in
// ./today.js) and the local minute of the day, which rows are past, where the
// now line sits, how much of the plan has gone by and what fits in the gap
// before the next item. Pure, so the client component can run it again every minute
// without pulling server modules into the bundle.

import { wallTime } from '../day.js';

const pad = value => String(value).padStart(2, '0');

/** Minutes as the widget prints them: 45m, 1h, 2h 05m. */
export function formatMinutes(total) {
  const minutes = Math.max(0, Math.round(Number(total) || 0));
  if (minutes < 60) return minutes + 'm';
  const rest = minutes % 60;
  return Math.floor(minutes / 60) + 'h' + (rest ? ' ' + pad(rest) + 'm' : '');
}

/** A minute of the day as HH:MM. */
export const clockOf = minute => pad(Math.floor(minute / 60) % 24) + ':' + pad(minute % 60);


/** The local wall clock as minutes since midnight. */
export function localMinutes(now = new Date()) {
  const [hours, minutes] = wallTime(now).split(':').map(Number);
  return hours * 60 + minutes;
}

/** Milliseconds to the next whole minute. Every timezone is a whole number of
 *  quarter hours from UTC, so the wall clock turns over on the same instant. A few ms late
 *  on purpose, so the tick lands just after the turn, never just before. */
export function untilNextMinute(ms = Date.now()) {
  return 60000 - (((ms % 60000) + 60000) % 60000) + 20;
}

/** The least gap worth offering as free time. */
export const MIN_FREE = 5;

const endOf = item => item.start + (item.minutes || 0);
const isPast = (item, now) => item.done || (item.minutes ? endOf(item) <= now : item.start < now);

/**
 * items: [{ start, minutes, done, kind, time, title, ... }] sorted by start.
 * Each row gains past (its time has gone by, or it is done) and struck (it is
 * over: done, or a meeting that has ended). A task whose time went by without
 * being ticked is past but not struck: it is still owed.
 * candidates: open tasks off the timeline, highest priority first:
 * [{ title, minutes, urgent }].
 */
export function liveDay({ items = [], candidates = [] } = {}, now) {
  const rows = items.map(item => {
    const past = isPast(item, now);
    return { ...item, past, struck: !!item.done || (past && item.kind === 'event') };
  });
  // The line sits where the clock is: after everything that has started.
  const nowIndex = rows.filter(item => item.start <= now).length;
  const planned = rows.reduce((sum, item) => sum + (item.minutes || 0), 0);
  const gone = rows.reduce((sum, item) => sum + (item.minutes ? (item.done ? item.minutes : Math.min(item.minutes, Math.max(0, now - item.start))) : 0), 0);
  const busy = rows.some(item => !item.done && item.start <= now && endOf(item) > now);
  const next = rows.find(item => !item.done && item.start > now);
  let free = null;
  if (!busy && next && next.start - now >= MIN_FREE) {
    const gap = next.start - now;
    const fit = candidates.find(task => task.minutes && task.minutes <= gap)
      || candidates.find(task => task.urgent && !task.minutes) || null;
    free = { until: next.time, minutes: gap, fit: fit ? { title: fit.title, minutes: fit.minutes || null } : null };
  }
  return {
    items: rows, now: clockOf(now), now_minutes: now, now_index: nowIndex, free,
    planned_minutes: planned, past_minutes: gone,
    progress: planned ? Math.round(gone / planned * 1000) / 10 : 0,
  };
}
