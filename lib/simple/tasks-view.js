// The Tasks page as pure functions: which group a task falls in, how a group
// sorts, what the counts are, and what ticking a repeating task does. The
// planning state is the only input, so a page, a route and a test all get the
// same answer. The rule that matters lives in completeTask: a recurring task
// rolls on done instead of leaving the list.
import { Tasks } from '../planning-models.js';
import { SECTIONS, sectionOf, ownerOf, isOpen } from '../task-list.js';
import { localDayStart, localToday, wallTime, timeZone } from '../day.js';
import { zonedMeetingInstant } from '../zoned-time.js';

export const REPEATS = ['none', 'daily', 'weekly', 'monthly'];
export const VIEWS = ['all', 'today', 'upcoming', 'none', 'done'];
export const GROUPS = ['overdue', 'today', 'upcoming', 'none'];
export const GROUP_LABELS = { overdue: 'OVERDUE', today: 'TODAY', upcoming: 'UPCOMING', none: 'NO DATE', done: 'DONE TODAY', done_week: 'DONE IN THE LAST 7 DAYS' };
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dated = value => Number.isFinite(Date.parse(value));

export const repeatOf = task => REPEATS.includes(task?.repeat) ? task.repeat : 'none';
export const dueTimeOf = task => typeof task?.due_time === 'string' && TIME.test(task.due_time) ? task.due_time : null;

export function dueGroupOf(task, today = localToday()) {
  if (!dated(task?.due_at)) return 'none';
  const day = localToday(new Date(task.due_at));
  return day < today ? 'overdue' : day === today ? 'today' : 'upcoming';
}

export function dueLabel(task, today = localToday()) {
  const group = dueGroupOf(task, today);
  if (group === 'none') return '';
  if (group === 'overdue') return 'OVERDUE';
  if (group === 'today') return 'DUE TODAY';
  // The local day names the label, the same day dueGroupOf grouped by. A task
  // due at 23:30 UTC in British Summer Time falls on the next local day, and
  // the weekday and the date have to say so too.
  const day = new Date(localToday(new Date(task.due_at)) + 'T00:00:00Z');
  const away = Math.round((day.getTime() - Date.parse(today)) / 86400000);
  // Inside the week the weekday is enough; past that you need the date.
  return away <= 6 ? 'DUE ' + WEEKDAYS[day.getUTCDay()] : 'DUE ' + day.getUTCDate() + ' ' + MONTHS[day.getUTCMonth()];
}

/** The next instant after `now` for this repeat, keeping the local time of
 *  day. The day and the wall time move separately, so a 09:00 task stays a
 *  09:00 task across the clock change. */
export function rollForward(dueAt, repeat, now = new Date()) {
  if (!REPEATS.includes(repeat) || repeat === 'none') return null;
  const start = new Date(dated(dueAt) ? dueAt : now);
  const time = wallTime(start);
  const first = localToday(start);
  const anchorDay = Number(first.slice(8, 10));
  let day = first;
  let guard = 0;
  let next;
  do {
    if (guard++ > 2000) return null;
    const date = new Date(day + 'T12:00:00Z');
    if (repeat === 'daily') date.setUTCDate(date.getUTCDate() + 1);
    else if (repeat === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
    else {
      // Move month first, then clamp: 31 January plus a month is 28 February,
      // and the anchor day is remembered so March gets its 31st back.
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + 1);
      const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(anchorDay, last));
    }
    day = date.toISOString().slice(0, 10);
    next = localInstant(day, time);
  } while (Date.parse(next) <= now.getTime());
  return new Date(next).toISOString();
}

// Where a repeating task rolls from. A task with a time but no date rolls from
// that time on today's local day, so a 09:00 daily task stays a 09:00 task
// whichever hour it is ticked at.
function repeatBase(task, now) {
  if (dated(task.due_at)) return task.due_at;
  const time = dueTimeOf(task);
  if (!time) return null;
  // The clocks change at that wall time twice a year. Then there is no instant
  // to name, and rollForward starts from now instead.
  try { return zonedMeetingInstant(localToday(now), time, timeZone()); } catch { return null; }
}


/** The local day after `day`, both as YYYY-MM-DD. */
function nextLocalDay(day) {
  const next = new Date(day + 'T00:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** The instant a local day reaches a wall time, clock-change nights included. */
function localInstant(day, time) {
  try { return zonedMeetingInstant(day, time, timeZone()); } catch {
    // Twice a year that wall time either never arrives or arrives twice, so
    // there is no single instant to name. Counting minutes from the day's own
    // midnight still lands on one real instant inside that local day, which
    // is all snooze needs.
    const [hours, minutes] = time.split(':').map(Number);
    // Noon UTC is inside the local day whether the offset is 0 or +1.
    const start = localDayStart(new Date(day + 'T12:00:00Z'));
    return new Date(start.getTime() + (hours * 60 + minutes) * 60000).toISOString();
  }
}

/**
 * Where Snooze moves a task: the next local day, at the same local wall
 * time. Adding 24 hours would drop a 09:00 task to 08:00 on the night the
 * clocks change, so the day and the time of day move separately. A task with
 * no time of day at all lands at 09:00 rather than at whatever hour the button
 * was pressed.
 */
export function snoozeDueAt(task, now = new Date()) {
  const hasDate = dated(task?.due_at);
  const day = nextLocalDay(hasDate ? localToday(new Date(task.due_at)) : localToday(now));
  const wall = hasDate ? wallTime(new Date(task.due_at)) : null;
  const time = dueTimeOf(task) || (TIME.test(wall || '') ? wall : '09:00');
  return localInstant(day, time);
}

/** A local day at a wall time as one instant. No time means 09:00. */
export function dueAtForDay(day, time) {
  if (!DAY.test(day || '')) throw new Error('Use a YYYY-MM-DD day.');
  return localInstant(day, TIME.test(time || '') ? time : '09:00');
}

/** When the phone should hear about a task: its due day at its due time,
 *  else at the local hour it is due, else 09:00. A time already gone means
 *  now, so a reminder switched on late still goes out once. */
export function reminderAt(task, now = new Date()) {
  const hasDate = dated(task?.due_at);
  const day = hasDate ? localToday(new Date(task.due_at)) : localToday(now);
  const wall = hasDate ? wallTime(new Date(task.due_at)) : null;
  const time = dueTimeOf(task) || (TIME.test(wall || '') ? wall : '09:00');
  const at = localInstant(day, time);
  return Date.parse(at) < now.getTime() ? now.toISOString() : at;
}

export function completeTask(state, id, now = new Date()) {
  const task = state?.tasks_by_id?.[id];
  if (!task) throw new Error('Task not found.');
  const repeat = repeatOf(task);
  // Restoring clears completed_at, so the model's own clock never shows.
  if (task.status === 'done') return Tasks.toggleDone(state, id);
  if (repeat !== 'none') {
    const due_at = rollForward(repeatBase(task, now), repeat, now);
    // A phone reminder follows the task to its next date; a fresh id makes
    // lib/task-reminders.js drop the receipt of the old one.
    const reminder = task.reminder?.id ? { ...task.reminder, id: globalThis.crypto.randomUUID(), at: reminderAt({ ...task, due_at }, now) } : task.reminder ?? null;
    return Tasks.updateTask(state, id, { due_at, asap: false, ...(task.reminder?.id ? { reminder } : {}) });
  }
  const next = Tasks.updateTask(state, id, { status: 'done' });
  // updateTask refuses completed_at in a patch, so the stamp goes on the fresh
  // copy it returns. The done view then reads the clock the caller passed in
  // rather than the machine's, which is what makes this function testable.
  next.tasks_by_id[id].completed_at = now.toISOString();
  return next;
}

export const shapeTask = (task, today) => ({
  id: task.id, title: task.title, section: sectionOf(task), owner_label: ownerOf(task),
  status: task.status, due_at: task.due_at || null, due_time: dueTimeOf(task), repeat: repeatOf(task),
  is_priority: !!task.is_priority, detail: task.detail || '',
  project_id: typeof task.project_id === 'string' && task.project_id ? task.project_id : null,
  remind: Boolean(task.reminder && task.reminder.id),
  group: dueGroupOf(task, today), due_label: dueLabel(task, today),
  created_at: task.created_at, completed_at: task.completed_at || null,
});

// Pinned first, then the moment it is due, then the order it was written.
const order = (a, b) =>
  (b.is_priority ? 1 : 0) - (a.is_priority ? 1 : 0)
  || String(a.due_at || '9').localeCompare(String(b.due_at || '9'))
  || String(a.created_at).localeCompare(String(b.created_at));

/** The local day `days` before `day`, both as YYYY-MM-DD. */
function daysBefore(day, days) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

// The last completion first, so what was just ticked sits at the top.
const newestDone = (a, b) => String(b.completed_at).localeCompare(String(a.completed_at));

/**
 * `doneWeek` adds what was finished in the last seven local days, today
 * included. On the open views it is one more group under the rest; on the done
 * view it replaces today's group. A repeating task rolls on instead of being
 * marked done, so it never shows here.
 */
export function simpleTasks(state, { view = 'all', domain = null, project = null, pinnedOnly = false, doneWeek = false, now = new Date() } = {}) {
  if (!VIEWS.includes(view)) throw new Error('Choose a view: ' + VIEWS.join(', ') + '.');
  const today = localToday(now);
  const all = Object.values(state?.tasks_by_id || {});
  const open = all.filter(isOpen).map(task => shapeTask(task, today));
  const doneToday = all
    .filter(task => task.status === 'done' && dated(task.completed_at) && localToday(new Date(task.completed_at)) === today)
    .map(task => shapeTask(task, today));
  const weekStart = daysBefore(today, 6);
  const doneThisWeek = all
    .filter(task => task.status === 'done' && dated(task.completed_at))
    .filter(task => { const day = localToday(new Date(task.completed_at)); return day >= weekStart && day <= today; })
    .map(task => shapeTask(task, today));

  const counts = {
    all: open.length,
    overdue: open.filter(task => task.group === 'overdue').length,
    due_today: open.filter(task => task.group === 'today').length,
    today: open.filter(task => task.group === 'overdue' || task.group === 'today').length,
    upcoming: open.filter(task => task.group === 'upcoming').length,
    none: open.filter(task => task.group === 'none').length,
    done: doneToday.length,
    done_week: doneThisWeek.length,
    pinned: open.filter(task => task.is_priority).length,
  };
  for (const section of SECTIONS) counts[section] = open.filter(task => task.section === section).length;
  counts.by_project = {};
  for (const task of open) if (task.project_id) counts.by_project[task.project_id] = (counts.by_project[task.project_id] || 0) + 1;

  const narrow = rows => rows
    .filter(task => !domain || task.section === domain)
    .filter(task => !project || task.project_id === project)
    .filter(task => !pinnedOnly || task.is_priority)
    .sort(order);

  const weekGroup = () => ({ key: 'done_week', label: GROUP_LABELS.done_week, tasks: narrow(doneThisWeek).sort(newestDone) });
  if (view === 'done') return { counts, groups: [doneWeek ? weekGroup() : { key: 'done', label: GROUP_LABELS.done, tasks: narrow(doneToday) }] };
  const wanted = view === 'today' ? ['overdue', 'today'] : view === 'upcoming' ? ['upcoming'] : view === 'none' ? ['none'] : GROUPS;
  const groups = wanted.map(key => ({ key, label: GROUP_LABELS[key], tasks: narrow(open.filter(task => task.group === key)) }));
  // An empty group is not a heading with nothing under it, except when the
  // view names exactly that group: then the page still shows its empty state.
  const shown = wanted.length === 1 ? groups : groups.filter(group => group.tasks.length);
  // The done group stays even when empty, so switching it on always answers.
  return { counts, groups: doneWeek ? [...shown, weekGroup()] : shown };
}

export function parseAddLine(line) {
  const raw = String(line || '').trim();
  const match = raw.match(/^(work|life|home)\s*:\s*(.*)$/i);
  if (!match) return { title: raw, section: 'work' };
  return { title: match[2].trim(), section: match[1].toLowerCase() };
}
