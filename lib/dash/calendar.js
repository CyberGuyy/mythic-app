// The month calendar: what falls on each local day. Three sources, all real
// records: open tasks on their due day, project deadlines, and events from
// the calendars you connected. The loader sends the current month with the month
// either side, so the widget can page between them without a reload.
// Weeks start on Monday.
import { isOpen, sectionOf } from '../task-list.js';
import { localToday } from '../day.js';
import { dueTimeOf } from '../simple/tasks-view.js';
import { ensureProjects, listProjects } from '../simple/projects.js';
import { calendarEvents } from '../connectors/calendar.js';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DOMAINS = ['work', 'life', 'home'];
const KIND_ORDER = { deadline: 0, event: 1, due: 2 };
const dated = value => Number.isFinite(Date.parse(value));

const utc = day => new Date(day + 'T12:00:00Z');
const dayOf = date => date.toISOString().slice(0, 10);
const addDays = (day, delta) => { const date = utc(day); date.setUTCDate(date.getUTCDate() + delta); return dayOf(date); };

export const isMonth = value => typeof value === 'string' && MONTH.test(value);

/** YYYY-MM moved by whole months. */
export function shiftMonth(month, delta) {
  if (!isMonth(month)) throw new Error('Use a YYYY-MM month.');
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + (number - 1) + delta;
  return String(Math.floor(index / 12)).padStart(4, '0') + '-' + String(index % 12 + 1).padStart(2, '0');
}

/** The grid of one month: Monday to Sunday rows, 35 cells or 42 when the
 *  month needs a sixth row. Each cell knows whether it is in the month, past
 *  or today. */
export function monthGrid(month, today) {
  if (!isMonth(month)) throw new Error('Use a YYYY-MM month.');
  const [year, number] = month.split('-').map(Number);
  const first = month + '-01';
  const length = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const lead = (utc(first).getUTCDay() + 6) % 7;
  const size = lead + length > 35 ? 42 : 35;
  const start = addDays(first, -lead);
  const cells = Array.from({ length: size }, (_, index) => {
    const day = addDays(start, index);
    return { day, date: Number(day.slice(8)), in_month: day.slice(0, 7) === month, past: day < today, today: day === today };
  });
  return { month, year, name: MONTH_NAMES[number - 1], cells };
}

function taskItems(state, projects, today) {
  const names = Object.fromEntries(projects.map(project => [project.id, project.name]));
  return Object.values(state?.tasks_by_id || {})
    .filter(task => isOpen(task) && dated(task.due_at))
    .map(task => {
      const day = localToday(new Date(task.due_at));
      const projectId = typeof task.project_id === 'string' && task.project_id ? task.project_id : null;
      return { day, item: {
        kind: 'due', id: task.id, title: String(task.title || 'Untitled task'), time: dueTimeOf(task),
        project_name: projectId ? names[projectId] || null : null, domain: sectionOf(task), late: day < today,
      } };
    });
}

function deadlineItems(projects) {
  return projects
    .filter(project => typeof (project.deadline || null) === 'string' && DAY.test(project.deadline))
    .map(project => ({ day: project.deadline, item: {
      kind: 'deadline', id: project.id, title: project.name, time: null, project_name: project.name,
      domain: DOMAINS.includes(project.domain) ? project.domain : 'work',
    } }));
}

/** Events from the connected calendars (lib/connectors/calendar.js), already
 *  on the local day and wall time. */
function eventItems(events) {
  return (events || [])
    .filter(event => event && DAY.test(event.day || ''))
    .map(event => ({ day: event.day, item: { kind: 'event', id: event.id, title: String(event.title || 'Event'), time: TIME.test(event.time || '') ? event.time : null, project_name: null, domain: 'work' } }));
}

/** Deadlines first, then by time of day (untimed last), then kind and title. */
export function sortItems(items) {
  return [...items].sort((a, b) =>
    (a.kind === 'deadline' ? 0 : 1) - (b.kind === 'deadline' ? 0 : 1)
    || (a.time || '99:99').localeCompare(b.time || '99:99')
    || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || a.title.localeCompare(b.title));
}

/**
 * Three months of grids and the items on every day those grids show.
 * `month` (YYYY-MM) picks the middle month; by default the local month of
 * `today`. Counts are per month, over the days inside that month.
 */
export function calendarView({ state, projects = [], events = [], today, month } = {}) {
  if (!DAY.test(today || '')) throw new Error('Use a YYYY-MM-DD day for today.');
  const current = isMonth(month) ? month : today.slice(0, 7);
  const months = [-1, 0, 1].map(delta => monthGrid(shiftMonth(current, delta), today));
  const from = months[0].cells[0].day, to = months[2].cells.at(-1).day;

  const days = {};
  for (const { day, item } of [...taskItems(state, projects, today), ...deadlineItems(projects), ...eventItems(events)]) {
    if (!day || day < from || day > to) continue;
    (days[day] ||= []).push(item);
  }
  for (const day of Object.keys(days)) days[day] = sortItems(days[day]);

  const counts = {};
  for (const grid of months) {
    const inMonth = Object.entries(days).filter(([day]) => day.slice(0, 7) === grid.month).flatMap(([, items]) => items);
    counts[grid.month] = {
      due: inMonth.filter(item => item.kind === 'due').length,
      deadline: inMonth.filter(item => item.kind === 'deadline').length,
      event: inMonth.filter(item => item.kind === 'event').length,
      days: new Set(Object.entries(days).filter(([day, items]) => day.slice(0, 7) === grid.month && items.length).map(([day]) => day)).size,
    };
  }
  return { today, month: current, months, days, counts };
}

/** The Dash loader. Needs the planning state; a missing one is an error, not
 *  an empty month. */
export async function loadCalendar({ db, state, today, options = {} }) {
  if (!state) throw new Error('Tasks are unavailable right now.');
  ensureProjects(db);
  const month = isMonth(options.month) ? options.month : today.slice(0, 7);
  const events = calendarEvents(db, { from: shiftMonth(month, -1) + '-01', to: shiftMonth(month, 2) + '-01' });
  return calendarView({ state, projects: listProjects(db), events, today, month });
}
