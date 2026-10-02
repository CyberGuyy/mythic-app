// Time on a task. Play on a row starts it (setPriority sets
// priority_started_at); Stop writes the run into the task's time_log as wall
// minutes since the start.
import { Tasks } from '../planning-models.js';
import { isOpen, setPriority } from '../task-list.js';

export const TIME_LOG_MAX = 200;
const minutesOf = ms => Math.max(0, Math.floor(ms / 60000));

/** Minutes the task's earlier runs logged. */
export function loggedMinutes(task) {
  return (Array.isArray(task?.time_log) ? task.time_log : []).reduce((sum, entry) => sum + (Number.isFinite(entry?.minutes) && entry.minutes > 0 ? entry.minutes : 0), 0);
}

/** Minutes of the run in progress. */
export function sessionMinutes(task, now = new Date()) {
  const from = Date.parse(task?.priority_started_at || '');
  return Number.isFinite(from) ? minutesOf(now.getTime() - from) : 0;
}

/** Everything logged on the task plus the run in progress. */
export function taskTime(task, { now = new Date() } = {}) {
  const session = sessionMinutes(task, now);
  return { minutes: loggedMinutes(task) + session, session, started_at: task?.priority_started_at || null };
}

/** Play: an open task becomes the one being done now. */
export function startClock(state, id, now = new Date()) {
  const task = state?.tasks_by_id?.[id];
  if (!task) throw new Error('Task not found.');
  if (!isOpen(task)) throw new Error('That task is already finished.');
  return setPriority(state, id, true, now);
}

/** Stop: the run goes into time_log and the start is cleared. A task that is
 *  not running is left as it is. */
export function stopClock(state, id, now = new Date()) {
  const task = state?.tasks_by_id?.[id];
  if (!task) throw new Error('Task not found.');
  if (!task.priority_started_at) return state;
  const log = [...(Array.isArray(task.time_log) ? task.time_log : []), { start: task.priority_started_at, end: now.toISOString(), minutes: sessionMinutes(task, now) }].slice(-TIME_LOG_MAX);
  return setPriority(Tasks.updateTask(state, id, { time_log: log }), id, false, now);
}

/** Priority on or off; turning it off logs the run first. */
export function setPriorityLogged(state, id, on, now = new Date()) {
  if (on) return setPriority(state, id, true, now);
  return setPriority(stopClock(state, id, now), id, false, now);
}
