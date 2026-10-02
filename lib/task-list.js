// The one task list. This module knows the fixed sections, who owns a task,
// the order the list shows and what priority means.
import { Tasks } from './planning-models.js';
import { localToday } from './day.js';

export const SECTIONS = ['work', 'life', 'home'];
export const TABS = ['all', ...SECTIONS];
const OPEN = new Set(['ready', 'in_progress', 'waiting']);

export const sectionOf = task => SECTIONS.includes(task?.section) ? task.section : 'work';
export const ownerOf = task => task?.owner === 'agent' ? 'agent' : 'you';
export const isOpen = task => OPEN.has(task?.status);

export function newTaskInput({ id, title, section = 'work', owner = 'you', asap, due_at = null, detail = '', source_quote = '', source_kind = 'typed', source_ref = null } = {}) {
  if (!SECTIONS.includes(section)) throw new Error('Choose a section: work, life or home.');
  if (!['you', 'agent'].includes(owner)) throw new Error('Choose an owner: you or agent.');
  if (due_at !== null && !Number.isFinite(Date.parse(due_at))) throw new Error('The due time must be a date.');
  return { ...(id ? { id } : {}), title: String(title || '').trim(), section, owner: owner === 'you' ? 'me' : 'agent', asap: asap === undefined ? due_at === null : !!asap, due_at, detail: String(detail || '').slice(0, 4000), source_quote: String(source_quote || '').slice(0, 2000), source_kind, source_ref, status: 'ready', is_priority: false, priority_started_at: null };
}

const shape = task => ({ ...task, section: sectionOf(task), owner_label: ownerOf(task), is_priority: !!task.is_priority, priority_started_at: task.priority_started_at || null });

export function taskList(state, { tab = 'all', now = new Date() } = {}) {
  const day = localToday(now);
  const dueDay = task => Number.isFinite(Date.parse(task.due_at)) ? localToday(new Date(task.due_at)) : null;
  const rank = task => task.is_priority ? 0 : task.due_at && dueDay(task) <= day ? 1 : task.asap ? 2 : 3;
  return Object.values(state.tasks_by_id || {})
    .filter(task => isOpen(task) && (tab === 'all' || sectionOf(task) === tab))
    .map(shape)
    .sort((a, b) => rank(a) - rank(b) || String(a.due_at || '9').localeCompare(String(b.due_at || '9')) || String(a.created_at).localeCompare(String(b.created_at)));
}

export function setPriority(state, id, on, now = new Date()) {
  if (!state.tasks_by_id?.[id]) throw new Error('Task not found.');
  const task = state.tasks_by_id[id];
  // Priority means "on the bench, being done now", so it carries in_progress.
  // Taking it off returns the task to ready; a waiting task stays waiting.
  const off = { is_priority: false, priority_started_at: null, ...(task.status === 'in_progress' ? { status: 'ready' } : {}) };
  // Already on: the start stays, so saving the editor never resets a running clock.
  const started = task.is_priority && task.priority_started_at ? task.priority_started_at : now.toISOString();
  return Tasks.updateTask(state, id, on ? { is_priority: true, priority_started_at: started, status: 'in_progress' } : off);
}

export function staleTasks(state, { now = new Date(), days = 14 } = {}) {
  const cutoff = now.getTime() - days * 86400000;
  return Object.values(state.tasks_by_id || {}).filter(task => isOpen(task) && !task.is_priority && Date.parse(task.updated_at || task.created_at) < cutoff).map(shape);
}
