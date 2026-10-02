import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { Tasks, emptyPlanning } from '../planning-models.js';
import { newTaskInput } from '../task-list.js';
import { ensureProjects, addProject, updateProject } from '../simple/projects.js';
import { tasksWidget, loadTasks, isoWeek, dashDueLabel, estimateOf, cleanEstimate } from './tasks.js';

// Wednesday 23 September 2026, 10:00 London (09:00 UTC).
const now = new Date('2026-09-23T09:00:00Z');
const today = '2026-09-23';
const ids = n => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const ID = { late: ids(1), today: ids(2), doing: ids(3), later: ids(4), none: ids(5), done: ids(6), old: ids(7), gone: ids(8), other: ids(9) };

function setup() {
  const db = new Database(':memory:');
  ensureProjects(db);
  const film = addProject(db, { name: 'Short film', domain: 'work', weekly_target: 3, weekly_unit: 'hours', now });
  const flat = addProject(db, { name: 'The flat', domain: 'home', now });
  let state = emptyPlanning();
  const add = (id, title, extra = {}) => { state = Tasks.addTask(state, { ...newTaskInput({ id, title, section: extra.section || 'work', due_at: extra.due_at ?? null }), ...extra }); };
  add(ID.late, 'Reply about shoot dates', { due_at: '2026-09-21T09:00:00Z', project_id: film, estimate_minutes: 15 });
  add(ID.today, 'Cut the film', { due_at: '2026-09-23T14:00:00Z', due_time: '15:00', project_id: film, estimate_minutes: 120 });
  add(ID.doing, 'Grade the b-roll', { project_id: film, status: 'in_progress', estimate_minutes: 90, due_at: '2026-09-25T09:00:00Z' });
  add(ID.later, 'Book the boiler service', { section: 'home', due_at: '2026-10-02T09:00:00Z', project_id: flat });
  add(ID.none, 'Plan the long run', { section: 'life' });
  add(ID.done, 'Send the invoice', { project_id: film, estimate_minutes: 60, due_at: '2026-09-22T09:00:00Z' });
  add(ID.old, 'Renew the gym', { section: 'life' });
  add(ID.gone, 'Cancelled thing', {});
  add(ID.other, 'Stray estimate', { estimate_minutes: 7000 });
  state.tasks_by_id[ID.done].status = 'done';
  state.tasks_by_id[ID.done].completed_at = '2026-09-22T16:00:00.000Z';
  state.tasks_by_id[ID.old].status = 'done';
  state.tasks_by_id[ID.old].completed_at = '2026-09-10T16:00:00.000Z';
  state.tasks_by_id[ID.gone].status = 'cancelled';
  return { db, state, film, flat };
}

test('estimates read only whole minutes in range, and a client value is checked', () => {
  assert.equal(estimateOf({ estimate_minutes: 30 }), 30);
  assert.equal(estimateOf({ estimate_minutes: 4 }), null);
  assert.equal(estimateOf({ estimate_minutes: 30.5 }), null);
  assert.equal(estimateOf({}), null);
  assert.equal(cleanEstimate(undefined), undefined);
  assert.equal(cleanEstimate(null), null);
  assert.equal(cleanEstimate(''), null);
  assert.equal(cleanEstimate(45), 45);
  assert.equal(cleanEstimate('90'), 90);
  for (const bad of [4, 1441, 12.5, 'soon', true]) assert.throws(() => cleanEstimate(bad), /whole minutes from 5 to 1440/);
});

test('the ISO week runs Monday to Sunday on local days', () => {
  assert.deepEqual(isoWeek('2026-09-23'), { start: '2026-09-21', end: '2026-09-27' });
  assert.deepEqual(isoWeek('2026-09-21'), { start: '2026-09-21', end: '2026-09-27' });
  assert.deepEqual(isoWeek('2026-09-27'), { start: '2026-09-21', end: '2026-09-27' });
  assert.throws(() => isoWeek('23/09'), /YYYY-MM-DD/);
});

test('due labels are short words', () => {
  assert.equal(dashDueLabel({ group: 'none' }), 'No date');
  assert.equal(dashDueLabel({ group: 'overdue', due_label: 'OVERDUE' }), 'Overdue');
  assert.equal(dashDueLabel({ group: 'today', due_label: 'DUE TODAY' }), 'Today');
  assert.equal(dashDueLabel({ group: 'today', due_label: 'DUE TODAY', due_time: '15:00' }), 'Today 15:00');
  assert.equal(dashDueLabel({ group: 'upcoming', due_label: 'DUE FRI' }), 'Fri');
  assert.equal(dashDueLabel({ group: 'upcoming', due_label: 'DUE 2 OCT' }), '2 Oct');
});

test('the groups follow the round 32 rules', () => {
  const { db, state, film, flat } = setup();
  const data = tasksWidget(state, db, { now, today });
  const titles = key => data.groups[key].map(row => row.title);
  assert.deepEqual(titles('urgent'), ['Reply about shoot dates', 'Cut the film']);
  assert.deepEqual(titles('doing'), ['Grade the b-roll']);
  assert.deepEqual(titles('todo').sort(), ['Book the boiler service', 'Plan the long run', 'Stray estimate']);
  assert.deepEqual(titles('done'), ['Send the invoice']);
  assert.deepEqual(data.groups.suggested, []);
  assert.deepEqual(data.counts, { open: 6, urgent: 2, done_week: 1 });

  const late = data.groups.urgent[0];
  assert.equal(late.kind, 'urgent');
  assert.equal(late.project_id, film);
  assert.equal(late.project_name, 'Short film');
  assert.equal(late.due_label, 'Overdue');
  assert.equal(late.due_late, true);
  assert.equal(late.estimate_minutes, 15);
  assert.equal(data.groups.urgent[1].due_label, 'Today 15:00');
  assert.equal(data.groups.urgent[1].due_late, false);
  const boiler = data.groups.todo.find(row => row.title === 'Book the boiler service');
  assert.equal(boiler.section, 'home');
  assert.equal(boiler.project_id, flat);
  assert.equal(boiler.due_label, '2 Oct');
  assert.equal(data.groups.todo.find(row => row.title === 'Plan the long run').due_label, 'No date');
  assert.equal(data.groups.todo.find(row => row.title === 'Stray estimate').estimate_minutes, null);
  assert.equal(data.groups.doing[0].status, 'in_progress');
  assert.equal(data.groups.done[0].kind, 'done');
  assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
});

test('projects carry this week, the bars and the deadline, defensively', () => {
  const { db, state, film, flat } = setup();
  updateProject(db, film, { deadline: '2026-10-02', now });
  const data = tasksWidget(state, db, { now, today });
  assert.deepEqual(data.projects.map(project => project.name), ['Short film', 'The flat']);
  const filmRow = data.projects.find(project => project.id === film);
  assert.equal(filmRow.deadline, '2026-10-02');
  assert.equal(filmRow.domain, 'work');
  assert.equal(filmRow.open, 3);
  assert.equal(filmRow.weekly_target, 3);
  assert.equal(filmRow.weekly_unit, 'hours');
  // One hour of estimates finished this week against a three hour target.
  assert.equal(filmRow.done_this_week, 1);
  assert.equal(filmRow.target_this_week, 3);
  assert.deepEqual(filmRow.bars, { done: 1, total: 3 });
  assert.equal(filmRow.week.minutes_done, 60);
  assert.equal(filmRow.week.minutes_planned, 180);
  assert.equal(filmRow.week.hours_done, 1);
  assert.equal(filmRow.week.hours_planned, 3);
  const home = data.projects.find(project => project.id === flat);
  assert.equal(home.deadline, null);
  assert.equal(home.weekly_target, null);
  assert.deepEqual(home.bars, { done: 0, total: 1 });

  // The whole week: 60 minutes done; due this week: late (15), today (120), doing (90), done (60).
  assert.equal(data.week.minutes_done, 60);
  assert.equal(data.week.minutes_planned, 285);
  assert.equal(data.week.hours_planned, 5);
});

test('a projects table without the deadline column still loads', () => {
  const db = new Database(':memory:');
  db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', weekly_target INTEGER, weekly_unit TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT)");
  db.prepare("INSERT INTO projects (id, name, domain, created_at, updated_at) VALUES ('p1', 'Old', 'life', ?, ?)").run(now.toISOString(), now.toISOString());
  const data = tasksWidget(emptyPlanning(), db, { now, today });
  assert.equal(data.projects[0].deadline, null);
  assert.deepEqual(data.groups.urgent, []);
});

test('the loader refuses a missing planning state', async () => {
  const { db, state } = setup();
  await assert.rejects(loadTasks({ db, state: null, now, today, options: {} }), /Tasks are unavailable right now/);
  const data = await loadTasks({ db, state, now, today, options: {} });
  assert.equal(data.today, today);
});

test('the week counts estimates finished in this ISO week on local days, and plans by due date or the hours target', () => {
  const db = new Database(':memory:');
  ensureProjects(db);
  const film = addProject(db, { name: 'Short film', domain: 'work', weekly_target: 4, weekly_unit: 'hours', now });
  const flat = addProject(db, { name: 'The flat', domain: 'home', weekly_target: 2, weekly_unit: 'tasks', now });
  let state = emptyPlanning();
  const add = (n, title, extra) => { state = Tasks.addTask(state, { ...newTaskInput({ id: ids(n), title, section: 'work', due_at: extra.due_at ?? null }), ...extra }); };
  const finish = (n, at) => { state.tasks_by_id[ids(n)].status = 'done'; state.tasks_by_id[ids(n)].completed_at = at; };
  // Monday 00:30 London is 23:30 UTC on the Sunday before: this week.
  add(1, 'Monday early', { project_id: film, estimate_minutes: 30 }); finish(1, '2026-09-20T23:30:00.000Z');
  // An hour earlier is 23:30 London on the Sunday: last week.
  add(2, 'Last Sunday', { project_id: film, estimate_minutes: 45 }); finish(2, '2026-09-20T22:30:00.000Z');
  // Due last week, finished this week: counts as done, not as planned.
  add(3, 'Late one', { project_id: film, estimate_minutes: 60, due_at: '2026-09-18T09:00:00Z' }); finish(3, '2026-09-22T10:00:00.000Z');
  // No estimate credits nothing but still counts as a finished task.
  add(4, 'Unsized', { project_id: flat }); finish(4, '2026-09-22T11:00:00.000Z');
  add(5, 'Due Sunday', { project_id: flat, estimate_minutes: 90, due_at: '2026-09-27T20:00:00Z' });
  add(6, 'Due next Monday', { project_id: flat, estimate_minutes: 30, due_at: '2026-09-28T09:00:00Z' });
  const data = tasksWidget(state, db, { now, today });
  const filmRow = data.projects.find(project => project.id === film);
  assert.equal(filmRow.week.minutes_done, 90);
  assert.equal(filmRow.week.hours_done, 1.5);
  // An hours target is the plan.
  assert.equal(filmRow.week.minutes_planned, 240);
  assert.equal(filmRow.done_this_week, 1.5);
  const home = data.projects.find(project => project.id === flat);
  assert.equal(home.week.minutes_done, 0);
  assert.equal(home.week.tasks_done, 1);
  // A tasks target plans from estimates due this week: Sunday's 90, not next Monday's.
  assert.equal(home.week.minutes_planned, 90);
  assert.equal(home.done_this_week, 1);
  assert.deepEqual(home.bars, { done: 1, total: 2 });
  assert.equal(data.week.minutes_done, 90);
  assert.equal(data.week.minutes_planned, 90);
});

test('an open task that is in progress and due today is urgent, and Done keeps seven days', () => {
  const db = new Database(':memory:');
  ensureProjects(db);
  let state = emptyPlanning();
  const add = (n, title, extra) => { state = Tasks.addTask(state, { ...newTaskInput({ id: ids(n), title, section: 'work', due_at: extra.due_at ?? null }), ...extra }); };
  add(1, 'Doing and due', { status: 'in_progress', due_at: '2026-09-23T15:00:00Z' });
  add(2, 'Doing later', { status: 'in_progress', due_at: '2026-09-24T15:00:00Z' });
  add(3, 'Six days ago', {}); state.tasks_by_id[ids(3)].status = 'done'; state.tasks_by_id[ids(3)].completed_at = '2026-09-17T12:00:00.000Z';
  add(4, 'Eight days ago', {}); state.tasks_by_id[ids(4)].status = 'done'; state.tasks_by_id[ids(4)].completed_at = '2026-09-15T12:00:00.000Z';
  const data = tasksWidget(state, db, { now, today });
  assert.deepEqual(data.groups.urgent.map(row => row.title), ['Doing and due']);
  assert.deepEqual(data.groups.doing.map(row => row.title), ['Doing later']);
  assert.deepEqual(data.groups.done.map(row => row.title), ['Six days ago']);
  // Done last week is in the Done group but not in this week's effort.
  assert.equal(data.week.tasks_done, 0);
});

test('a started row carries its clock for the play and stop button; others carry none', async () => {
  const { setPriority } = await import('../task-list.js');
  const { db, state: base } = setup();
  const state = setPriority(Tasks.updateTask(base, ID.doing, { time_log: [{ start: '2026-09-22T09:00:00.000Z', end: '2026-09-22T09:30:00.000Z', minutes: 30 }] }), ID.doing, true, new Date(now.getTime() - 45 * 60000));
  const rows = Object.values(tasksWidget(state, db, { now, today }).groups).flat();
  const doing = rows.find(row => row.id === ID.doing);
  assert.deepEqual(doing.clock, { started_at: new Date(now.getTime() - 45 * 60000).toISOString(), minutes: 75, estimate_minutes: 90 });
  assert.equal(rows.find(row => row.id === ID.none).clock, null);
  assert.equal(rows.find(row => row.id === ID.done)?.clock ?? null, null);
});
