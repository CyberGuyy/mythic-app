// What can be done to a task, checked and written. The Dash route
// (app/api/tasks), the token API (app/api/v1) and the Telegram worker all
// come through here, so a task is checked the same way whoever sends it.
import { randomUUID } from 'node:crypto';
import { Tasks } from '../planning-models.js';
import { SECTIONS, newTaskInput } from '../task-list.js';
import { REPEATS, completeTask, parseAddLine, snoozeDueAt, dueAtForDay, reminderAt } from '../simple/tasks-view.js';
import { ensureProjects, projectNames } from '../simple/projects.js';
import { cleanEstimate } from '../dash/estimate.js';
import { startClock, stopClock, setPriorityLogged } from './clock.js';
import { mutateTasks } from './store.js';

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const need = (condition, message) => { if (!condition) throw new Error(message); };
const blank = value => value === undefined || value === null || value === '';

function isoOrNull(value) {
  if (blank(value)) return null;
  need(Number.isFinite(Date.parse(value)), 'Choose a valid due date.');
  return new Date(value).toISOString();
}

/** A project id that was sent, checked against the list. Nothing sent means none. */
function projectIdOf(db, value) {
  if (blank(value)) return null;
  ensureProjects(db);
  need(typeof value === 'string' && projectNames(db)[value], 'Choose an existing project or none.');
  return value;
}

/** The editor's fields, checked. */
export function editorFields(db, body) {
  need(typeof body.title === 'string' && body.title.trim(), 'A task needs a title.');
  const section = body.section === undefined ? 'work' : body.section;
  need(SECTIONS.includes(section), 'Choose work, life or home.');
  const repeat = body.repeat === undefined ? 'none' : body.repeat;
  need(REPEATS.includes(repeat), 'Choose none, daily, weekly or monthly.');
  const dueTime = blank(body.due_time) ? null : body.due_time;
  need(dueTime === null || TIME.test(dueTime), 'Choose a valid due time.');
  let dueAt;
  if (body.due_day !== undefined) {
    need(blank(body.due_day) || DAY.test(body.due_day), 'Choose a valid due date.');
    dueAt = body.due_day ? dueAtForDay(body.due_day, dueTime) : null;
  } else dueAt = isoOrNull(body.due_at);
  return {
    title: body.title.trim().slice(0, 500), section, project_id: projectIdOf(db, body.project_id),
    due_at: dueAt, due_time: dueTime, repeat, asap: dueAt === null,
    detail: String(body.detail || '').slice(0, 4000),
    remind: !!body.remind, is_priority: body.is_priority === undefined ? undefined : !!body.is_priority,
    estimate_minutes: cleanEstimate(body.estimate_minutes),
  };
}

/** On means a reminder exists at reminderAt; a moved time gets a new id so
 *  the worker sends it again. Off means none. */
function reminderPatch(task, fields, now) {
  if (!fields.remind) return { reminder: null };
  const at = reminderAt({ ...task, due_at: fields.due_at, due_time: fields.due_time }, now);
  if (task?.reminder?.id && task.reminder.at === at) return {};
  return { reminder: { id: randomUUID(), at } };
}

// The two fields the page sends that are not stored on the task as they stand.
const stored = ({ remind, is_priority: pinned, ...patch }) => {
  if (patch.estimate_minutes === undefined) delete patch.estimate_minutes;
  return patch;
};

/** A new task: { line } (the add line, a "work:" prefix picks the section)
 *  or the editor's fields. Returns its id. source says where it came from. */
export function createTask(db, body, { now = new Date(), source = 'typed' } = {}) {
  const id = randomUUID();
  let input;
  if (body.action === 'add' || (typeof body.line === 'string' && body.title === undefined)) {
    const { title, section } = parseAddLine(body.line);
    need(title, 'Write a title for the task.');
    input = { ...newTaskInput({ id, title: title.slice(0, 500), section, source_kind: source }), project_id: projectIdOf(db, body.project_id) };
    mutateTasks(db, state => Tasks.addTask(state, input));
    return id;
  }
  const fields = editorFields(db, body);
  input = { ...newTaskInput({ id, title: fields.title, section: fields.section, due_at: fields.due_at, detail: fields.detail, source_kind: source }), ...stored(fields), ...reminderPatch(null, fields, now) };
  mutateTasks(db, state => {
    const next = Tasks.addTask(state, input);
    return fields.is_priority ? setPriorityLogged(next, id, true, now) : next;
  });
  return id;
}

/** Run one action on an existing task. */
export function changeTask(db, action, body, { now = new Date() } = {}) {
  const { id } = body;
  const exists = state => need(state?.tasks_by_id?.[id], 'Task not found.');
  const actions = {
    update: () => {
      const fields = editorFields(db, body);
      return state => {
        exists(state);
        const next = Tasks.updateTask(state, id, { ...stored(fields), ...reminderPatch(state.tasks_by_id[id], fields, now) });
        return fields.is_priority === undefined ? next : setPriorityLogged(next, id, fields.is_priority, now);
      };
    },
    // The title alone. Update rewrites every editor field.
    rename: () => {
      need(typeof body.title === 'string' && body.title.trim(), 'A task needs a title.');
      return state => { exists(state); return Tasks.updateTask(state, id, { title: body.title.trim().slice(0, 500) }); };
    },
    estimate: () => {
      const estimate = cleanEstimate(body.estimate_minutes);
      need(estimate !== undefined, 'Send estimate_minutes, or null to clear it.');
      return state => { exists(state); return Tasks.updateTask(state, id, { estimate_minutes: estimate }); };
    },
    // Done, or back to open; a repeating task rolls on to its next date.
    toggle: () => state => { exists(state); return completeTask(stopClock(state, id, now), id, now); },
    pin: () => state => { exists(state); return setPriorityLogged(state, id, !!body.on, now); },
    start: () => state => { exists(state); return startClock(state, id, now); },
    stop: () => state => { exists(state); return stopClock(state, id, now); },
    // The next day at the same time of day.
    snooze: () => state => { exists(state); return Tasks.updateTask(state, id, { due_at: snoozeDueAt(state.tasks_by_id[id], now), asap: false }); },
    // The task stays open, it just stops being dated.
    dismiss: () => state => { exists(state); return Tasks.updateTask(state, id, { due_at: null, asap: true }); },
    // Kept as cancelled, so nothing is lost; it leaves the list.
    delete: () => state => { exists(state); return Tasks.updateTask(state, id, { status: 'cancelled' }); },
  };
  need(Object.hasOwn(actions, action), 'Unknown action.');
  const transform = actions[action]();
  return mutateTasks(db, transform).state.tasks_by_id[id] || null;
}
