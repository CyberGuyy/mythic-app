// Where tasks are kept: one row per task in SQLite, the task itself as JSON.
// Reads hand back the task state ({ schema_version, tasks_by_id }) the pure
// task modules work on (lib/planning-models.js, lib/simple/tasks-view.js);
// a change reads the state, runs a transform and writes back only the rows
// that changed, all inside one transaction.
import { emptyPlanning } from '../planning-models.js';

export function ensureTasks(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS task_items (
    id TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    status TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS task_items_status ON task_items (status);`);
}

/** The whole task state. Cancelled (deleted) tasks are left out. */
export function readTasks(db) {
  ensureTasks(db);
  const state = emptyPlanning();
  for (const row of db.prepare("SELECT json FROM task_items WHERE status != 'cancelled'").all()) {
    try {
      const task = JSON.parse(row.json);
      if (task?.id) state.tasks_by_id[task.id] = task;
    } catch { /* a row that no longer parses is skipped, never shown half-read */ }
  }
  return state;
}

/** Run transform(state) and save what it changed. Returns { state, result }
 *  where result is whatever the transform put on the context. */
export function mutateTasks(db, transform) {
  ensureTasks(db);
  const run = db.transaction(() => {
    const before = readTasks(db);
    const context = {};
    const after = transform(before, context) || before;
    const upsert = db.prepare('INSERT INTO task_items (id, json, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, status = excluded.status, updated_at = excluded.updated_at');
    for (const [id, task] of Object.entries(after.tasks_by_id || {})) {
      const json = JSON.stringify(task);
      if (before.tasks_by_id[id] && JSON.stringify(before.tasks_by_id[id]) === json) continue;
      upsert.run(id, json, task.status || 'ready', task.updated_at || new Date().toISOString());
    }
    // A task gone from the state is kept as cancelled, so nothing is lost.
    for (const id of Object.keys(before.tasks_by_id)) {
      if (after.tasks_by_id?.[id]) continue;
      const task = { ...before.tasks_by_id[id], status: 'cancelled', updated_at: new Date().toISOString() };
      upsert.run(id, JSON.stringify(task), 'cancelled', task.updated_at);
    }
    return { state: after, result: context };
  });
  return run();
}
