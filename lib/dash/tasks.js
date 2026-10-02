// The Dash tasks widget as pure functions over the planning state and the
// projects table. One load returns everything the widget needs, so picking a
// project on the page reorders what is already there and never refetches.
//
// Groups:
//   urgent   open and overdue or due today
//   todo     open and not doing
//   doing    status in_progress
//   done     finished in the last seven local days (collapsed on the page)
//
// Estimates: a task may carry estimate_minutes (a whole number, 5 to 1440, or
// null). Finishing a task credits its estimate to the week; a task without an
// estimate credits nothing. Effort is kept apart from completion.
import { simpleTasks, dueTimeOf, repeatOf } from '../simple/tasks-view.js';
import { isOpen, sectionOf } from '../task-list.js';
import { ensureProjects, listProjects, projectStatus } from '../simple/projects.js';
import { localToday } from '../day.js';
import { estimateOf, cleanEstimate } from './estimate.js';
import { taskTime } from '../tasks/clock.js';

export const MAX_BARS = 10;
export { estimateOf, cleanEstimate };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dated = value => Number.isFinite(Date.parse(value));
const dayOf = iso => localToday(new Date(iso));
function shiftDay(day, delta) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** The ISO week (Monday to Sunday) holding a local day, as two days. */
export function isoWeek(today) {
  if (!DAY.test(today || '')) throw new Error('Use a YYYY-MM-DD day.');
  const back = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const start = shiftDay(today, -back);
  return { start, end: shiftDay(start, 6) };
}

const WEEKDAYS = { SUN: 'Sun', MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat' };
const titleCase = word => word.charAt(0) + word.slice(1).toLowerCase();

/** The short due label the rows show: Overdue, Today 15:00, Mon, 2 Oct or
 *  No date. Built on the local day the task list itself groups by. */
export function dashDueLabel(row) {
  if (row.group === 'none') return 'No date';
  if (row.group === 'overdue') return 'Overdue';
  if (row.group === 'today') return row.due_time ? 'Today ' + row.due_time : 'Today';
  const label = String(row.due_label || '').replace(/^DUE\s+/, '');
  if (WEEKDAYS[label]) return WEEKDAYS[label] + (row.due_time ? ' ' + row.due_time : '');
  const [date, month] = label.split(' ');
  return month ? date + ' ' + titleCase(month) : label;
}

/** Hours for the week figures: halves, as a number. */
const hours = minutes => Math.round(minutes / 30) / 2;

function weekFigures(tasks, week, planned = null) {
  const inWeek = day => day >= week.start && day <= week.end;
  const doneThisWeek = tasks.filter(task => task.status === 'done' && dated(task.completed_at) && inWeek(dayOf(task.completed_at)));
  const minutesDone = doneThisWeek.reduce((sum, task) => sum + (estimateOf(task) || 0), 0);
  const dueThisWeek = tasks.filter(task => (isOpen(task) || task.status === 'done') && dated(task.due_at) && inWeek(dayOf(task.due_at)));
  const minutesPlanned = planned ?? dueThisWeek.reduce((sum, task) => sum + (estimateOf(task) || 0), 0);
  return { minutes_done: minutesDone, minutes_planned: minutesPlanned, hours_done: hours(minutesDone), hours_planned: hours(minutesPlanned), tasks_done: doneThisWeek.length };
}

/** The small bars on a project's picker button: this week's done against its
 *  weekly target, one bar a unit (at most MAX_BARS, scaled past that). Without
 *  a target the bars are this week's finished tasks against those plus the
 *  open ones, so the button still says how far the project has moved. */
function barsOf(done, target, open) {
  const whole = target ?? done + open;
  if (!whole) return { done: 0, total: 0 };
  const total = Math.min(whole, MAX_BARS);
  return { done: Math.min(total, Math.round((Math.min(done, whole) / whole) * total)), total };
}

function shapeProject(project, tasks, week, now) {
  const own = tasks.filter(task => task.project_id === project.id);
  const status = projectStatus(project, tasks, { now });
  const byHours = project.weekly_unit === 'hours';
  const target = Number.isInteger(project.weekly_target) ? project.weekly_target : null;
  const figures = weekFigures(own, week, byHours && target ? target * 60 : null);
  const done = byHours ? figures.hours_done : figures.tasks_done;
  return {
    id: project.id, name: project.name, domain: project.domain, note: project.note || '',
    deadline: typeof project.deadline === 'string' && DAY.test(project.deadline) ? project.deadline : null,
    weekly_target: target, weekly_unit: target ? project.weekly_unit || 'tasks' : null,
    open: status.open, status: status.key, status_label: status.label,
    done_this_week: done, target_this_week: target,
    bars: barsOf(done, target, status.open),
    week: figures,
  };
}

/** The whole widget: projects for the picker, the groups, and this week's
 *  effort, from the planning state and the database. */
export function tasksWidget(state, db, { now = new Date(), today = localToday(now) } = {}) {
  if (!state) throw new Error('Tasks are unavailable right now.');
  ensureProjects(db);
  const all = Object.values(state.tasks_by_id || {});
  const week = isoWeek(today);
  const projects = listProjects(db).map(project => shapeProject(project, all, week, now));
  const names = Object.fromEntries(projects.map(project => [project.id, project.name]));

  const view = simpleTasks(state, { view: 'all', doneWeek: true, now });
  const clockOf = task => {
    const time = taskTime(task, { now });
    return { started_at: time.started_at, minutes: time.minutes, estimate_minutes: estimateOf(task) };
  };
  const row = shaped => {
    const task = state.tasks_by_id[shaped.id] || {};
    const open = isOpen(task);
    const urgent = open && (shaped.group === 'overdue' || shaped.group === 'today');
    const kind = !open ? 'done' : urgent ? 'urgent' : task.status === 'in_progress' ? 'doing' : 'todo';
    const project = shaped.project_id && names[shaped.project_id] ? shaped.project_id : null;
    return {
      id: shaped.id, title: shaped.title, section: sectionOf(task), kind, status: task.status,
      project_id: project, project_name: project ? names[project] : null,
      due_label: dashDueLabel({ ...shaped, due_time: dueTimeOf(task) }), due_late: open && shaped.group === 'overdue',
      estimate_minutes: estimateOf(task), is_priority: !!shaped.is_priority,
      completed_at: shaped.completed_at || null,
      // what the task composer's edit mode starts from (every editor field)
      due_at: dated(task.due_at) ? task.due_at : null, due_day: dated(task.due_at) ? dayOf(task.due_at) : null,
      due_time: dueTimeOf(task), repeat: repeatOf(task), remind: !!task.reminder?.id, detail: typeof task.detail === 'string' ? task.detail : '',
      // play and stop: the run's start, the time so far and the estimate its ring fills toward
      clock: open && task.priority_started_at ? clockOf(task) : null,
    };
  };
  const openRows = view.groups.filter(group => group.key !== 'done_week').flatMap(group => group.tasks).map(row);
  const doneRows = (view.groups.find(group => group.key === 'done_week')?.tasks || []).map(row);
  const of = kind => openRows.filter(item => item.kind === kind);

  return {
    today,
    projects,
    groups: { urgent: of('urgent'), todo: of('todo'), doing: of('doing'), done: doneRows, suggested: [] },
    counts: { open: openRows.length, urgent: of('urgent').length, done_week: doneRows.length },
    week: weekFigures(all, week),
  };
}

/** The registry loader (lib/dash/widgets.js). */
export const loadTasks = async ({ db, state, now, today }) => tasksWidget(state, db, { now, today });
