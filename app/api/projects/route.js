import { getDb } from '@/lib/db.js';
import { ensureProjects, addProject, updateProject, deleteProject, detachProjectTasks } from '@/lib/simple/projects.js';
import { RouteError, jsonRoute } from '@/lib/http.js';
import { mutateTasks } from '@/lib/tasks/store.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const need = (condition, message) => { if (!condition) throw new RouteError(message); };
const wrap = call => { try { return call(); } catch (error) { throw new RouteError(error.message); } };
const fields = body => ({ name: body.name, domain: body.domain, note: body.note, next_step: body.next_step, weekly_target: body.weekly_target, weekly_unit: body.weekly_unit, deadline: body.deadline, now: new Date() });

export const POST = jsonRoute(async body => {
  const db = getDb();
  ensureProjects(db);
  const { action } = body;
  if (action === 'add') return { ok: true, id: wrap(() => addProject(db, fields(body))) };
  need(typeof body.id === 'string' && body.id, 'Name the project.');
  if (action === 'update') { wrap(() => updateProject(db, body.id, fields(body))); return { ok: true }; }
  if (action === 'delete') {
    // The row is archived first so a crash between the two writes leaves the
    // tasks attached to a project that no longer lists, which the page reads
    // as "no project"; the reverse order would show a project with no tasks.
    wrap(() => deleteProject(db, body.id, new Date()));
    mutateTasks(db, state => detachProjectTasks(state, body.id));
    return { ok: true };
  }
  throw new RouteError('Unknown action.');
});
