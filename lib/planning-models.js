// The task model as pure functions over the task state ({ tasks_by_id }).
// Every change returns a fresh copy, so a route can build the next state,
// check it and only then write it (lib/tasks/store.js).
import { randomUUID } from 'node:crypto';

const STATUSES = new Set(['ready', 'in_progress', 'waiting', 'done', 'cancelled']);
// Fields a patch may not set: identity and the clocks this module keeps.
const LOCKED = new Set(['id', 'created_at', 'updated_at', 'completed_at']);
const copy = value => JSON.parse(JSON.stringify(value));
const stamp = () => new Date().toISOString();

export function emptyPlanning() {
  return { schema_version: 1, tasks_by_id: {} };
}

function check(task) {
  if (typeof task.title !== 'string' || !task.title.trim()) throw new Error('A task needs a title.');
  if (task.title.length > 500) throw new Error('Keep the title under 500 characters.');
  if (!STATUSES.has(task.status)) throw new Error('Unknown task status.');
  if (task.due_at !== null && task.due_at !== undefined && !Number.isFinite(Date.parse(task.due_at))) throw new Error('The due time must be a date.');
  return task;
}

export const Tasks = {
  addTask(state, input) {
    const next = copy(state || emptyPlanning());
    next.tasks_by_id ||= {};
    const id = input.id || randomUUID();
    if (next.tasks_by_id[id]) throw new Error('That task already exists.');
    const at = stamp();
    next.tasks_by_id[id] = check({ status: 'ready', due_at: null, ...input, id, title: String(input.title || '').trim(), created_at: at, updated_at: at, completed_at: null });
    return next;
  },

  updateTask(state, id, patch = {}) {
    const task = state?.tasks_by_id?.[id];
    if (!task) throw new Error('Task not found.');
    for (const key of Object.keys(patch)) if (LOCKED.has(key)) throw new Error('That field cannot be changed.');
    const next = copy(state);
    const updated = { ...next.tasks_by_id[id], ...copy(patch), updated_at: stamp() };
    if (updated.status !== 'done') updated.completed_at = null;
    next.tasks_by_id[id] = check(updated);
    return next;
  },

  /** Done becomes ready again; anything else becomes done now. */
  toggleDone(state, id) {
    const task = state?.tasks_by_id?.[id];
    if (!task) throw new Error('Task not found.');
    const next = Tasks.updateTask(state, id, { status: task.status === 'done' ? 'ready' : 'done' });
    if (next.tasks_by_id[id].status === 'done') next.tasks_by_id[id].completed_at = stamp();
    return next;
  },
};
