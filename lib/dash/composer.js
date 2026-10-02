// The Dash composer's pure parts: the labels its date, time and duration
// chips show, the mini calendar's month grid, time parsing, and one mapper a
// form that turns what you filled in into the body its existing route takes.
// No imports but the estimate rules, so the client components, the routes'
// tests and node --test all read the same functions.
import { ESTIMATE_MIN, ESTIMATE_MAX, formatEstimate } from './estimate.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = MONTHS.map(name => name.slice(0, 3));
const pad = value => String(value).padStart(2, '0');

export const SECTIONS = ['work', 'life', 'home'];
export const REPEATS = ['none', 'daily', 'weekly', 'monthly'];
export const TIMES_OF_DAY = ['morning', 'afternoon', 'evening'];

/** A real YYYY-MM-DD day (not 2026-02-30). */
export function isDay(value) {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  return new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
}
export const isTime = value => typeof value === 'string' && TIME.test(value);

/** A day moved by whole days. Midday UTC keeps it clear of the clock change. */
export function addDays(day, delta) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
const weekday = day => new Date(day + 'T12:00:00Z').getUTCDay();

/** The Monday after today (a week on when today is a Monday). */
export function nextMonday(today) {
  const back = (weekday(today) + 6) % 7;
  return addDays(today, 7 - back);
}

/** The quick chips of the date popover, in order. */
export function quickDays(today) {
  return [['Today', today], ['Tomorrow', addDays(today, 1)], ['Next Mon', nextMonday(today)]];
}

/** What the date chip says: Today, Tomorrow, Yesterday, "Fri 26 Sep", with
 *  the year only when it is not this year's, or "No date". */
export function dateChipLabel(day, today) {
  if (!isDay(day)) return 'No date';
  if (isDay(today)) {
    if (day === today) return 'Today';
    if (day === addDays(today, 1)) return 'Tomorrow';
    if (day === addDays(today, -1)) return 'Yesterday';
  }
  const date = new Date(day + 'T12:00:00Z');
  const label = WEEKDAYS[date.getUTCDay()] + ' ' + date.getUTCDate() + ' ' + SHORT_MONTHS[date.getUTCMonth()];
  return isDay(today) && day.slice(0, 4) !== today.slice(0, 4) ? label + ' ' + day.slice(0, 4) : label;
}

/** The month a YYYY-MM is moved by whole months. */
export function addMonths(month, delta) {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + (number - 1) + delta;
  return Math.floor(index / 12) + '-' + pad((index % 12) + 1);
}
export function monthTitle(month, today) {
  const [year, number] = month.split('-').map(Number);
  return MONTHS[number - 1] + (isDay(today) && Number(today.slice(0, 4)) === year ? '' : ' ' + year);
}

/** The mini calendar: whole Monday-first weeks covering the month, each cell
 *  { day, date, in_month }. Five or six weeks, as the month needs. */
export function monthCells(month) {
  const first = month + '-01';
  const start = addDays(first, -((weekday(first) + 6) % 7));
  const next = addMonths(month, 1) + '-01';
  const cells = [];
  for (let day = start; day < next || cells.length % 7; day = addDays(day, 1)) {
    cells.push({ day, date: Number(day.slice(8)), in_month: day.slice(0, 7) === month });
  }
  return cells;
}

/** A typed time as HH:MM: "930", "9:30", "9.30", "0930", "1530", "9", "15",
 *  "9am", "9:30 pm". '' for a blank field; null when it is not a time. */
export function parseTime(text) {
  const raw = String(text ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!raw) return '';
  // hours and minutes with a separator, or run together ("930", "1530"), or hours alone
  const match = raw.match(/^(\d{1,2})[:.h](\d{2})(am|pm)?$/) || raw.match(/^(\d{1,2})(\d{2})(am|pm)?$/) || raw.match(/^(\d{1,2})()(am|pm)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (match[3]) {
    if (hours < 1 || hours > 12) return null;
    hours = hours % 12 + (match[3] === 'pm' ? 12 : 0);
  }
  if (hours > 23 || minutes > 59) return null;
  return pad(hours) + ':' + pad(minutes);
}

/** What the time chip says. */
export const timeChipLabel = time => (isTime(time) ? time : 'No time');

/** The time popover's quick chips ([label, time]) and columns. Bed and wake
 *  times get chips of their own. */
export const TIME_QUICK = [['Morning', '09:00'], ['Noon', '12:00'], ['Afternoon', '14:00'], ['Evening', '18:00']];
export const BED_QUICK = ['22:30', '23:00', '23:30', '00:00'].map(time => [time, time]);
export const WAKE_QUICK = ['06:30', '07:00', '07:30', '08:00'].map(time => [time, time]);

/** Minutes between a bedtime and a wake time: a bed from noon on is the
 *  evening before (the sleep route's rule). null unless both are times. */
export function nightLength(bed, woke) {
  if (!isTime(bed) || !isTime(woke)) return null;
  const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const start = minutes(bed) >= 720 ? minutes(bed) - 1440 : minutes(bed);
  return minutes(woke) - start;
}
export const HOURS = Array.from({ length: 24 }, (_, hour) => pad(hour));
export const MINUTES = Array.from({ length: 12 }, (_, step) => pad(step * 5));

/** A time with its hour or its minute replaced; a missing time starts at :00. */
export function withHour(time, hour) { return pad(Number(hour)) + ':' + (isTime(time) ? time.slice(3) : '00'); }
export function withMinute(time, minute, fallbackHour = '09') { return (isTime(time) ? time.slice(0, 2) : fallbackHour) + ':' + pad(Number(minute)); }

/** The duration chips, in minutes, and what each says. */
export const DURATION_CHIPS = [15, 30, 45, 60, 90, 120, 180];
export function durationChipLabel(minutes) {
  if (minutes < 60) return minutes + 'm';
  const rest = minutes % 60;
  return Math.floor(minutes / 60) + 'h' + (rest ? pad(rest) : '');
}
export { formatEstimate };

/** A typed number of minutes: null for blank, a number when it is whole
 *  minutes from 5 to 1440, NaN otherwise. */
export function readMinutes(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const number = Number(raw);
  return Number.isInteger(number) && number >= ESTIMATE_MIN && number <= ESTIMATE_MAX ? number : NaN;
}


/* ---------- the forms' starting values ---------- */

const text = value => (typeof value === 'string' ? value : '');

/** A task form from a task row (edit) or a prefill (new). */
export function taskStart(record, prefill = {}) {
  const from = record || prefill;
  return {
    title: text(from.title),
    section: SECTIONS.includes(from.section) ? from.section : 'work',
    project_id: from.project_id || null,
    due_day: isDay(from.due_day) ? from.due_day : null,
    due_time: isTime(from.due_time) ? from.due_time : null,
    estimate_minutes: Number.isInteger(from.estimate_minutes) ? from.estimate_minutes : null,
    repeat: REPEATS.includes(from.repeat) ? from.repeat : 'none',
    remind: !!from.remind,
    is_priority: !!from.is_priority,
    detail: text(from.detail),
  };
}

export function noteStart(record, prefill = {}) {
  const from = record || prefill;
  return { title: text(from.title), body: text(from.body), project_id: from.project_id || null };
}

export function projectStart(record, prefill = {}) {
  const from = record || prefill;
  return {
    name: text(from.name),
    domain: SECTIONS.includes(from.domain) ? from.domain : 'work',
    deadline: isDay(from.deadline) ? from.deadline : null,
    weekly_target: Number.isInteger(from.weekly_target) ? String(from.weekly_target) : '',
    weekly_unit: from.weekly_unit === 'hours' ? 'hours' : 'tasks',
    note: text(from.note),
  };
}

/** A habit: the record's own values when editing (its icon only if you
 *  picked one), else the prefill. */
export function habitStart(prefill = {}, record = null) {
  const from = record || prefill;
  const icon = record ? (record.icon_picked ? record.icon : null) : prefill.icon;
  return { name: text(from.name ?? from.title), time_of_day: TIMES_OF_DAY.includes(from.time_of_day) ? from.time_of_day : 'morning', icon: icon || null };
}

/** A night: the day the sleep route would start on, and that night's times if
 *  it is already logged. */
export function nightStart(prefill = {}) {
  const day = isDay(prefill.day) ? prefill.day : null;
  const logged = day && prefill.nights?.[day];
  return { day, bed_at: logged?.bed_at || prefill.bed_at || null, woke_at: logged?.woke_at || prefill.woke_at || null, note: logged?.note || text(prefill.note) };
}



/* ---------- the forms' checks, in the routes' own words ---------- */

// Each form's route error lines and the field they are about, so a refusal
// shows under the field it concerns. A line not listed shows under the form.
export const ROUTE_FIELDS = {
  task: {
    'A task needs a title.': 'title', 'Write a title for the task.': 'title',
    'Choose work, life or home.': 'section', 'Choose none, daily, weekly or monthly.': 'repeat',
    'Choose a valid due time.': 'due_time', 'Choose a valid due date.': 'due_day',
    'An estimate is whole minutes from 5 to 1440.': 'estimate_minutes', 'Choose an existing project or none.': 'project_id',
  },
  note: { 'Give the note a title.': 'title', 'Write the note as text.': 'body', 'Choose an existing project or none.': 'project_id' },
  project: {
    'Give the project a name.': 'name', 'Choose work, life or home.': 'domain',
    'Use a YYYY-MM-DD day for the deadline.': 'deadline', 'The weekly target is a whole number from 1 to 999.': 'weekly_target',
    'Count the target in tasks or hours.': 'weekly_target',
  },
  habit: { 'Give the habit a name.': 'name', 'Choose morning, afternoon or evening.': 'time_of_day', 'Pick one of the habit icons.': 'icon' },
  night: {
    'Choose the day you woke up, as YYYY-MM-DD.': 'day', 'That morning has not happened yet.': 'day',
    'Write the bedtime as HH:MM.': 'bed_at', 'Write the wake time as HH:MM.': 'woke_at',
    'A night runs between 1 and 16 hours.': 'woke_at', 'Write the note as text.': 'note',
  },
};

/** Which field a route's error line is about, or null for the whole form. */
export function fieldOf(kind, message) {
  const table = ROUTE_FIELDS[kind === 'event' ? 'task' : kind] || {};
  return table[message] || null;
}


/** The checks a form makes before it posts, in the routes' words. Returns
 *  { field: message } for what is missing; empty when it can be sent. */
export function checkForm(kind, form) {
  const problems = {};
  if (kind === 'task' || kind === 'event') {
    if (!form.title.trim()) problems.title = 'A task needs a title.';
    if (kind === 'event' && !isDay(form.due_day)) problems.due_day = 'Choose a day.';
    if (kind === 'event' && !isTime(form.due_time)) problems.due_time = 'Choose a time.';
    if (Number.isNaN(form.estimate_minutes)) problems.estimate_minutes = 'An estimate is whole minutes from 5 to 1440.';
  }
  if (kind === 'note' && !form.title.trim()) problems.title = 'Give the note a title.';
  if (kind === 'project') {
    if (!form.name.trim()) problems.name = 'Give the project a name.';
    const target = String(form.weekly_target).trim();
    if (target && !(Number.isInteger(Number(target)) && Number(target) >= 1 && Number(target) <= 999)) problems.weekly_target = 'The weekly target is a whole number from 1 to 999.';
  }
  if (kind === 'habit' && !form.name.trim()) problems.name = 'Give the habit a name.';
  if (kind === 'night') {
    if (!isDay(form.day)) problems.day = 'Choose the day you woke up, as YYYY-MM-DD.';
    if (!isTime(form.bed_at)) problems.bed_at = 'Write the bedtime as HH:MM.';
    if (!isTime(form.woke_at)) problems.woke_at = 'Write the wake time as HH:MM.';
  }
  return problems;
}

/* ---------- the form-to-route mappers ---------- */

/** A task (or an event: a task with a day and a time) for /api/tasks.
 *  An edit sends every editor field, since update rewrites them all. When the
 *  day and the time are what the task already had, its exact due_at goes back
 *  instead, so an imported 17:00 without a stored time is not moved to 09:00. */
export function taskBody(form, original = null) {
  const unchanged = original && original.due_at && form.due_day === (original.due_day || null) && form.due_time === (original.due_time || null);
  const when = unchanged ? { due_at: original.due_at, due_time: form.due_time } : { due_day: form.due_day || null, due_time: form.due_time || null };
  return {
    action: original ? 'update' : 'create',
    ...(original ? { id: original.id } : {}),
    title: form.title.trim(),
    section: form.section,
    project_id: form.project_id || null,
    ...when,
    estimate_minutes: form.estimate_minutes ?? null,
    repeat: form.repeat || 'none',
    remind: !!form.remind,
    is_priority: !!form.is_priority,
    detail: form.detail || '',
  };
}

export const taskDeleteBody = id => ({ action: 'delete', id });

/** A note for /api/notes. updated_at is the stamp it had when the editor
 *  opened; null after a stale save was refused, so the next save wins. */
export function noteBody(form, original = null, seen = original?.stamp ?? null) {
  return {
    action: 'save',
    ...(original ? { id: original.id } : {}),
    ...(original && seen ? { updated_at: seen } : {}),
    title: form.title.trim(),
    body: form.body,
    project_id: form.project_id || null,
  };
}
export const noteDeleteBody = id => ({ action: 'delete', id });

/** A project for /api/projects. A blank target clears it. */
export function projectBody(form, original = null) {
  const target = String(form.weekly_target ?? '').trim();
  return {
    action: original ? 'update' : 'add',
    ...(original ? { id: original.id } : {}),
    name: form.name.trim(),
    domain: form.domain,
    deadline: form.deadline || null,
    weekly_target: target ? Number(target) : null,
    weekly_unit: form.weekly_unit === 'hours' ? 'hours' : 'tasks',
    note: form.note || '',
  };
}

/** A habit for /api/habits: a new one, an edit of `original`, or with
 *  `replacing` a new habit that takes the original's place (the count stays
 *  at five). Its icon goes to /api/flower once the habit has an id
 *  (habitIconBody). */
export function habitBody(form, original = null, replacing = false) {
  const action = !original ? 'add' : replacing ? 'replace' : 'update';
  return { action, ...(original ? { id: original.id } : {}), name: form.name.trim(), time_of_day: form.time_of_day };
}
export const habitIconBody = (id, icon) => ({ action: 'icon', habit_id: id, icon: icon || null });

/** A night for /api/sleep. */
export const nightBody = form => ({ action: 'night', day: form.day, bed_at: form.bed_at, woke_at: form.woke_at, note: form.note || '' });



/** Every form's route. */
export const ROUTES = {
  task: '/api/tasks', event: '/api/tasks', note: '/api/notes', project: '/api/projects',
  habit: '/api/habits', night: '/api/sleep',
};

/** The headings and the Japanese subtitles Yoru shows beside them. */
export const HEADINGS = {
  task: ['New task', 'Edit task', 'tasks', 'タスク'],
  event: ['New event', 'Edit event', 'calendar', '予定'],
  note: ['New note', 'Edit note', 'notes', 'メモ'],
  project: ['New project', 'Edit project', 'flag', '計画'],
  habit: ['New habit', 'Edit habit', 'habits', '習慣'],
  night: ['Log a night', 'Log a night', 'moon', '睡眠'],
  'vision-frame': ['Frame photo', 'Frame photo', 'crop', '構図'],
};
export function headingOf(kind, editing) {
  const [fresh, edit, icon, jp] = HEADINGS[kind] || HEADINGS.task;
  return { title: editing ? edit : fresh, icon, jp };
}

/** Whether a form has moved from where it started (the unsaved-changes guard). */
export function changed(start, form) {
  return Object.keys({ ...start, ...form }).some(key => !same(start[key], form[key]) && !(isBlank(start[key]) && isBlank(form[key])));
}
// A list (the picked videos) is the same when it holds the same items in the same order.
const same = (a, b) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((item, index) => item === b[index]) : (a ?? null) === (b ?? null));
const isBlank = value => value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length);
