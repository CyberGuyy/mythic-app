// The Today widget's data: the local day as a timetable. Timed tasks due
// today (a reminder is just a task with a reminder on it) and today's meetings
// from the planning state, sorted by time, with the day's planned minutes and
// the open tasks that could fill a gap. The live parts (past rows, the now
// line, the free block) come from ./today-live.js, which the client runs again
// every minute.
import { SECTIONS, sectionOf, isOpen } from '../task-list.js';
import { dueGroupOf, dueTimeOf } from '../simple/tasks-view.js';
import { calendarEvents } from '../connectors/calendar.js';
import { localToday } from '../day.js';
import { ensureProjects, listProjects } from '../simple/projects.js';
import { estimateOf } from './estimate.js';
import { liveDay, localMinutes } from './today-live.js';

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MAX_CANDIDATES = 40;
const dated = value => Number.isFinite(Date.parse(value));
const clean = text => String(text ?? '').replace(/[\u2012\u2013\u2014\u2015\u2212]/g, '-').replace(/\s+/g, ' ').trim();
const minutesOf = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// Pinned first, then overdue, due today, later, undated; then by due time and age.
const rankOf = (task, today) => task.is_priority ? 0 : { overdue: 1, today: 2, upcoming: 3, none: 4 }[dueGroupOf(task, today)];
const byRank = today => (a, b) => rankOf(a, today) - rankOf(b, today)
  || String(a.due_at || '9').localeCompare(String(b.due_at || '9'))
  || String(a.created_at).localeCompare(String(b.created_at));

/**
 * The day's items and the fill-in candidates. projects: listProjects(db) rows.
 * Returns plain JSON: { day, items, candidates } plus liveDay's fields for `now`.
 */
export function todayView(state, { now = new Date(), today = localToday(now), projects = [], events = [] } = {}) {
  const byId = new Map(projects.map(project => [project.id, project]));
  const tasks = Object.values(state?.tasks_by_id || {});
  const items = [];

  for (const task of tasks) {
    if (!dated(task.due_at) || (!isOpen(task) && task.status !== 'done')) continue;
    const time = dueTimeOf(task);
    if (!time || dueGroupOf(task, today) !== 'today') continue;
    const project = task.project_id ? byId.get(task.project_id) : null;
    items.push({
      id: task.id, kind: task.reminder ? 'reminder' : 'task', time, start: minutesOf(time),
      title: clean(task.title), minutes: estimateOf(task), project_name: project?.name || null,
      domain: SECTIONS.includes(project?.domain) ? project.domain : sectionOf(task), done: task.status === 'done',
    });
  }

  for (const event of events) {
    if (event.day !== today || !TIME.test(event.time || '')) continue;
    items.push({ id: event.id, kind: 'event', time: event.time, start: minutesOf(event.time), title: clean(event.title) || 'Event',
      minutes: event.minutes || null, project_name: null, domain: 'work', done: false });
  }

  items.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
  const onTimeline = new Set(items.map(item => item.id));
  // A waiting task is blocked on someone else, so it cannot fill a gap.
  const candidates = tasks
    .filter(task => isOpen(task) && task.status !== 'waiting' && !onTimeline.has(task.id))
    .sort(byRank(today))
    .slice(0, MAX_CANDIDATES)
    .map(task => ({ id: task.id, title: clean(task.title), minutes: estimateOf(task), urgent: rankOf(task, today) <= 2 }));

  return { day: today, ...liveDay({ items, candidates }, localMinutes(now)), candidates };
}

/** The registry loader. */
export async function loadToday({ db, state, now, today }) {
  if (!state) throw new Error('Tasks are unavailable right now.');
  ensureProjects(db);
  return todayView(state, { now, today, projects: listProjects(db), events: calendarEvents(db, { from: today, to: today }) });
}
