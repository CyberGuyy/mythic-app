// The token API for tasks.
//   GET  /api/v1/tasks            open tasks, soonest first (?view=today|upcoming|none|done|all)
//   POST /api/v1/tasks            { title, due_day?, due_time?, section?, project?, detail?, estimate_minutes?, repeat? }
//                                 or { line: "work: write the report" }
//   POST /api/v1/tasks            { action: "done" | "delete" | ..., id } changes one task
import { simpleTasks } from '@/lib/simple/tasks-view.js';
import { readTasks } from '@/lib/tasks/store.js';
import { createTask, changeTask } from '@/lib/tasks/actions.js';
import { ensureProjects, listProjects } from '@/lib/simple/projects.js';
import { tokenRoute, need, RouteError } from '@/lib/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VIEWS = ['all', 'today', 'upcoming', 'none', 'done'];

export const GET = tokenRoute(async (body, request, db) => {
  const view = new URL(request.url).searchParams.get('view') || 'all';
  need(VIEWS.includes(view), 'Use view=' + VIEWS.join(', ') + '.');
  ensureProjects(db);
  const names = Object.fromEntries(listProjects(db).map(project => [project.id, project.name]));
  const { groups, counts } = simpleTasks(readTasks(db), { view });
  const tasks = groups.flatMap(group => group.tasks.map(task => ({
    id: task.id, title: task.title, section: task.section, status: task.status, group: group.key,
    due_at: task.due_at, due_time: task.due_time, repeat: task.repeat, priority: task.is_priority,
    project: task.project_id ? names[task.project_id] || null : null, detail: task.detail,
  })));
  return { tasks, counts };
});

/** A project given by name (or id), matched without case. */
function projectOf(db, value) {
  if (value === undefined || value === null || value === '') return null;
  ensureProjects(db);
  const wanted = String(value).trim().toLowerCase();
  const found = listProjects(db).find(project => project.id === value || project.name.toLowerCase() === wanted);
  need(found, `No project called "${value}".`);
  return found.id;
}

const ACTIONS = { done: 'toggle', toggle: 'toggle', delete: 'delete', snooze: 'snooze', start: 'start', stop: 'stop', rename: 'rename', update: 'update' };

export const POST = tokenRoute(async (body, request, db) => {
  try {
    if (body.action) {
      need(ACTIONS[body.action], 'Use action ' + Object.keys(ACTIONS).join(', ') + '.');
      need(typeof body.id === 'string' && body.id, 'Send the id of the task.');
      const task = changeTask(db, ACTIONS[body.action], { ...body, ...(body.project !== undefined ? { project_id: projectOf(db, body.project) } : {}) });
      return { ok: true, task: task && { id: task.id, title: task.title, status: task.status, due_at: task.due_at } };
    }
    const input = typeof body.line === 'string' && body.title === undefined ? { line: body.line } : { ...body, project_id: projectOf(db, body.project ?? body.project_id) };
    if (input.line !== undefined) input.project_id = projectOf(db, body.project);
    return { ok: true, id: createTask(db, input, { source: 'api' }) };
  } catch (error) {
    throw error instanceof RouteError ? error : new RouteError(error.message);
  }
});
