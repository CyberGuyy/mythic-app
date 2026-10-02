// Tasks: every change the Dash makes to the list. One JSON POST with an
// action; the change runs on the task state inside one transaction
// (lib/tasks/store.js).
import { getDb } from '@/lib/db.js';
import { createTask, changeTask } from '@/lib/tasks/actions.js';
import { jsonRoute, need, RouteError } from '@/lib/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = jsonRoute(async body => {
  const db = getDb();
  const { action } = body;
  if (action === 'add' || action === 'create') return { ok: true, id: createTask(db, body) };
  need(typeof body.id === 'string' && body.id, 'Name the task.');
  try {
    changeTask(db, action, body);
  } catch (error) {
    throw error instanceof RouteError ? error : new RouteError(error.message, error.message === 'Task not found.' ? 404 : 400);
  }
  return { ok: true };
});
