import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { Tasks } from '../planning-models.js';
import { emptyPlanning } from '../planning-models.js';
import { newTaskInput } from '../task-list.js';
import { DOMAINS, WEEKLY_UNITS, QUIET_DAYS, ensureProjects, addProject, updateProject, deleteProject, listProjects, projectOptions, projectNames, detachProjectTasks, projectStatus, projectsView } from './projects.js';

const now = new Date('2026-09-15T10:00:00Z');
const fresh = () => { const db = new Database(':memory:'); ensureProjects(db); return db; };
const ID = {
  overdue: '11111111-1111-4111-8111-111111111111',
  today: '22222222-2222-4222-8222-222222222222',
  soon: '33333333-3333-4333-8333-333333333333',
  old: '44444444-4444-4444-8444-444444444444',
};

function seed(projectId, quietId) {
  let state = emptyPlanning();
  state = Tasks.addTask(state, newTaskInput({ id: ID.overdue, title: 'Finish the agentic workflow', section: 'work', due_at: '2026-09-14T09:00:00Z' }));
  state = Tasks.addTask(state, newTaskInput({ id: ID.today, title: 'Send the garden brief', section: 'work', due_at: '2026-09-15T15:00:00Z' }));
  state = Tasks.addTask(state, newTaskInput({ id: ID.soon, title: 'Draft the moving cost', section: 'life' }));
  state = Tasks.addTask(state, newTaskInput({ id: ID.old, title: 'Income roadmap', section: 'life' }));
  for (const id of [ID.overdue, ID.today]) state = Tasks.updateTask(state, id, { project_id: projectId });
  for (const id of [ID.soon, ID.old]) state = Tasks.updateTask(state, id, { project_id: quietId });
  // Six days of silence on the quiet project's tasks.
  for (const id of [ID.soon, ID.old]) state.tasks_by_id[id].updated_at = '2026-09-09T10:00:00.000Z';
  return state;
}

test('a project is created, edited, listed and archived', () => {
  const db = fresh();
  assert.deepEqual(DOMAINS, ['work', 'life', 'home']);
  assert.deepEqual(WEEKLY_UNITS, ['tasks', 'hours']);
  const id = addProject(db, { name: '  Side project ', domain: 'work', note: 'Going well', weekly_target: 3, weekly_unit: 'tasks', now });
  assert.equal(listProjects(db)[0].name, 'Side project');
  assert.equal(listProjects(db)[0].weekly_target, 3);
  updateProject(db, id, { name: 'Side project two', domain: 'life', weekly_target: null, now });
  assert.equal(listProjects(db)[0].name, 'Side project two');
  assert.equal(listProjects(db)[0].domain, 'life');
  assert.equal(listProjects(db)[0].weekly_target, null);
  assert.deepEqual(projectOptions(db), [{ id, name: 'Side project two' }]);
  assert.deepEqual(projectNames(db), { [id]: 'Side project two' });
  assert.equal(listProjects(db)[0].next_step, '');
  updateProject(db, id, { next_step: '  Send the brief ', now });
  assert.equal(listProjects(db)[0].next_step, 'Send the brief');
  assert.equal(listProjects(db)[0].name, 'Side project two');
  deleteProject(db, id, now);
  assert.deepEqual(listProjects(db), []);
  assert.equal(db.prepare('SELECT archived_at FROM projects WHERE id = ?').get(id).archived_at, now.toISOString());
});

test('a bad name, domain or target is refused', () => {
  const db = fresh();
  assert.throws(() => addProject(db, { name: ' ', domain: 'work', now }), /name/i);
  assert.throws(() => addProject(db, { name: 'X', domain: 'office', now }), /work, life or home/);
  assert.throws(() => addProject(db, { name: 'X', domain: 'work', weekly_target: -1, now }), /target/i);
  assert.throws(() => addProject(db, { name: 'X', domain: 'work', weekly_target: 2, weekly_unit: 'days', now }), /tasks or hours/);
  assert.throws(() => updateProject(db, 'nope', { name: 'X' }), /not found/i);
});

test('deleting a project detaches its tasks and deletes none', () => {
  const state = detachProjectTasks(seed('p-1', 'p-2'), 'p-1');
  assert.equal(state.tasks_by_id[ID.overdue].project_id, null);
  assert.equal(state.tasks_by_id[ID.today].project_id, null);
  assert.equal(state.tasks_by_id[ID.soon].project_id, 'p-2');
  assert.equal(Object.keys(state.tasks_by_id).length, 4);
});

test('status is overdue, then due today, then quiet, then on track', () => {
  const state = seed('p-1', 'p-2');
  const tasks = Object.values(state.tasks_by_id);
  const busy = projectStatus({ id: 'p-1', updated_at: '2026-09-15T09:00:00.000Z' }, tasks, { now });
  assert.equal(busy.key, 'overdue');
  assert.equal(busy.label, 'Overdue');
  assert.equal(busy.pill, 'pill-coral');
  assert.equal(busy.open, 2);
  assert.equal(busy.activity, 'Active today');
  assert.equal(busy.next, 'Finish the agentic workflow');
  const quiet = projectStatus({ id: 'p-2', updated_at: '2026-09-01T09:00:00.000Z' }, tasks, { now });
  assert.equal(QUIET_DAYS, 3);
  assert.equal(quiet.key, 'quiet');
  assert.equal(quiet.label, 'Quiet 6 days');
  assert.equal(quiet.pill, 'pill-quiet');
  assert.equal(quiet.quiet_days, 6);
  assert.equal(quiet.activity, 'Quiet 6 days');
  const dueToday = projectStatus({ id: 'p-1', updated_at: now.toISOString() }, tasks.filter(task => task.id !== ID.overdue), { now });
  assert.equal(dueToday.key, 'due_today');
  assert.equal(dueToday.pill, 'pill-honey');
  const empty = projectStatus({ id: 'p-9', updated_at: now.toISOString() }, tasks, { now });
  assert.equal(empty.key, 'on_track');
  assert.equal(empty.label, 'On track');
  assert.equal(empty.next, null);
});

test('the page view groups by domain, counts, and writes the summary line', () => {
  const db = fresh();
  const work = addProject(db, { name: 'Side project', domain: 'work', now });
  const life = addProject(db, { name: 'Moving out', domain: 'life', now });
  const view = projectsView(seed(work, life), db, { now });
  assert.deepEqual(view.counts, { projects: 2, due_today: 0, overdue: 1 });
  assert.deepEqual(view.domains.map(domain => [domain.domain, domain.label, domain.open, domain.projects.length]), [['work', 'Work', 2, 1], ['life', 'Life', 2, 1], ['home', 'Home', 0, 0]]);
  assert.equal(view.domains[0].projects[0].key, 'overdue');
  assert.equal(view.summary, 'One at work, one in life. Moving out has gone quiet.');
  assert.equal(projectsView(emptyPlanning(), fresh(), { now }).summary, 'No projects yet. Add one and give its tasks a home.');
});

test('a stored next step beats the first open task on the card, and the column is added to an old table', () => {
  const db = new Database(':memory:');
  db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', weekly_target INTEGER, weekly_unit TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT)");
  ensureProjects(db);
  const work = addProject(db, { name: 'Side project', domain: 'work', now });
  const life = addProject(db, { name: 'Moving out', domain: 'life', now });
  updateProject(db, work, { next_step: 'Send the plumber the garden brief', now });
  const view = projectsView(seed(work, life), db, { now });
  assert.equal(view.domains[0].projects[0].next, 'Send the plumber the garden brief');
  assert.equal(view.domains[1].projects[0].next, 'Draft the moving cost');
});

test('a deadline is a real YYYY-MM-DD day or nothing, and an old table gains the column', () => {
  const db = new Database(':memory:');
  db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', next_step TEXT NOT NULL DEFAULT '', weekly_target INTEGER, weekly_unit TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT)");
  ensureProjects(db);
  ensureProjects(db);
  const id = addProject(db, { name: 'Short film', domain: 'work', now });
  assert.equal(listProjects(db)[0].deadline, null);
  updateProject(db, id, { deadline: '2026-10-02', now });
  assert.equal(listProjects(db)[0].deadline, '2026-10-02');
  updateProject(db, id, { name: 'Kitchen delivery', now });
  assert.equal(listProjects(db)[0].deadline, '2026-10-02');
  for (const bad of ['2026-02-30', '2 Oct', '2026-10-2', 20261002]) assert.throws(() => updateProject(db, id, { deadline: bad, now }), /YYYY-MM-DD/);
  assert.equal(listProjects(db)[0].deadline, '2026-10-02');
  updateProject(db, id, { deadline: null, now });
  assert.equal(listProjects(db)[0].deadline, null);
  updateProject(db, id, { deadline: '2026-12-31', now });
  updateProject(db, id, { deadline: '', now });
  assert.equal(listProjects(db)[0].deadline, null);
});

test('a project can be added with its deadline, and a bad day is refused before the insert', () => {
  const db = new Database(':memory:');
  ensureProjects(db);
  addProject(db, { name: 'Kitchen delivery', domain: 'work', deadline: '2026-10-02', now });
  addProject(db, { name: 'No date yet', domain: 'life', deadline: '', now });
  assert.deepEqual(listProjects(db).map(project => [project.name, project.deadline]), [['Kitchen delivery', '2026-10-02'], ['No date yet', null]]);
  assert.throws(() => addProject(db, { name: 'Bad', domain: 'work', deadline: '2 Oct', now }), /YYYY-MM-DD/);
  assert.equal(listProjects(db).length, 2);
});
