import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from '../db.js';
import { wallTime } from '../day.js';
import { ensureProjects, addProject, deleteProject } from '../simple/projects.js';
import { readTasks } from './store.js';
import { createTask, changeTask } from './actions.js';

// Monday 5 October 2026, 11:00 in London (BST, UTC+1).
const now = new Date('2026-10-05T10:00:00Z');

function setup() {
  const db = memoryDb();
  ensureProjects(db);
  const project = addProject(db, { name: 'Garden shed', domain: 'home', now });
  return { db, project, task: id => readTasks(db).tasks_by_id[id] };
}

test('createTask from an add line takes the section from its prefix', () => {
  const { db, task } = setup();
  const id = createTask(db, { line: 'life:  Book the dentist ' }, { now });
  const saved = task(id);
  assert.equal(saved.id, id);
  assert.equal(saved.title, 'Book the dentist');
  assert.equal(saved.section, 'life');
  assert.equal(saved.status, 'ready');
  assert.equal(saved.owner, 'me');
  assert.equal(saved.asap, true);
  assert.equal(saved.due_at, null);
  assert.equal(saved.project_id, null);
  assert.equal(saved.source_kind, 'typed');
  // No prefix means work; source says where a task came from.
  const plain = task(createTask(db, { action: 'add', line: 'Fix the tap' }, { now, source: 'telegram' }));
  assert.equal(plain.section, 'work');
  assert.equal(plain.source_kind, 'telegram');
  assert.throws(() => createTask(db, { line: 'home:   ' }, { now }), /Write a title for the task/);
  assert.equal(Object.keys(readTasks(db).tasks_by_id).length, 2);
});

test('createTask from a line can name a project', () => {
  const { db, project, task } = setup();
  const id = createTask(db, { line: 'home: Buy the wood', project_id: project }, { now });
  assert.equal(task(id).project_id, project);
});

test('createTask with the editor fields stores them, with its project, reminder and priority', () => {
  const { db, project, task } = setup();
  const id = createTask(db, {
    action: 'create', title: '  Paint the shed  ', section: 'home', project_id: project,
    due_day: '2026-10-07', due_time: '15:00', repeat: 'weekly', estimate_minutes: 45,
    detail: 'Two coats', remind: true, is_priority: true,
  }, { now });
  const saved = task(id);
  assert.equal(saved.title, 'Paint the shed');
  assert.equal(saved.section, 'home');
  assert.equal(saved.project_id, project);
  // 15:00 London in British Summer Time is 14:00 UTC.
  assert.equal(saved.due_at, '2026-10-07T14:00:00.000Z');
  assert.equal(saved.due_time, '15:00');
  assert.equal(saved.asap, false);
  assert.equal(saved.repeat, 'weekly');
  assert.equal(saved.estimate_minutes, 45);
  assert.equal(saved.detail, 'Two coats');
  assert.equal(saved.owner, 'me');
  // The reminder goes out at the due time; the page's remind flag itself is not stored.
  assert.equal(saved.reminder.at, '2026-10-07T14:00:00.000Z');
  assert.match(saved.reminder.id, /^[0-9a-f-]{36}$/);
  assert.equal('remind' in saved, false);
  // Priority on means it is being done now.
  assert.equal(saved.is_priority, true);
  assert.equal(saved.status, 'in_progress');
  assert.equal(saved.priority_started_at, now.toISOString());
});

test('createTask with the editor fields fills defaults and checks what it is sent', () => {
  const { db, task } = setup();
  const saved = task(createTask(db, { title: 'Call the bank' }, { now }));
  assert.deepEqual([saved.section, saved.repeat, saved.due_at, saved.due_time, saved.asap, saved.reminder, saved.is_priority, saved.project_id],
    ['work', 'none', null, null, true, null, false, null]);
  assert.equal('estimate_minutes' in saved, false, 'no estimate sent means none stored');
  assert.throws(() => createTask(db, { title: '   ' }, { now }), /A task needs a title/);
  assert.throws(() => createTask(db, { title: 'x', section: 'gym' }, { now }), /Choose work, life or home/);
  assert.throws(() => createTask(db, { title: 'x', repeat: 'yearly' }, { now }), /Choose none, daily, weekly or monthly/);
  assert.throws(() => createTask(db, { title: 'x', due_day: '2026-10-07', due_time: '25:00' }, { now }), /Choose a valid due time/);
  assert.throws(() => createTask(db, { title: 'x', due_day: 'Friday' }, { now }), /Choose a valid due date/);
  assert.throws(() => createTask(db, { title: 'x', estimate_minutes: 3 }, { now }), /whole minutes from 5 to 1440/);
  assert.equal(Object.keys(readTasks(db).tasks_by_id).length, 1);
});

test('an unknown or archived project is refused and nothing is written', () => {
  const { db, project } = setup();
  assert.throws(() => createTask(db, { title: 'Paint the shed', project_id: 'no-such-project' }, { now }), /Choose an existing project or none/);
  assert.throws(() => createTask(db, { line: 'Paint the shed', project_id: 'no-such-project' }, { now }), /Choose an existing project or none/);
  assert.throws(() => createTask(db, { title: 'Paint the shed', project_id: 42 }, { now }), /Choose an existing project or none/);
  deleteProject(db, project, now);
  assert.throws(() => createTask(db, { title: 'Paint the shed', project_id: project }, { now }), /Choose an existing project or none/);
  assert.deepEqual(readTasks(db).tasks_by_id, {});
  // Moving an existing task to an unknown project is refused too.
  const id = createTask(db, { title: 'Paint the shed' }, { now });
  assert.throws(() => changeTask(db, 'update', { id, title: 'Paint the shed', project_id: 'no-such-project' }, { now }), /Choose an existing project or none/);
  assert.equal(readTasks(db).tasks_by_id[id].project_id, null);
});

test('toggling a repeating task rolls its due date forward and keeps it open', () => {
  const { db, task } = setup();
  const id = createTask(db, { title: 'Water the plants', section: 'home', due_day: '2026-10-05', due_time: '09:00', repeat: 'weekly' }, { now });
  assert.equal(task(id).due_at, '2026-10-05T08:00:00.000Z');
  const rolled = changeTask(db, 'toggle', { id }, { now });
  assert.equal(rolled.status, 'ready');
  assert.equal(rolled.due_at, '2026-10-12T08:00:00.000Z');
  assert.equal(rolled.asap, false);
  assert.equal(rolled.completed_at, null);
  assert.deepEqual(task(id), rolled);
});

test('a weekly 09:00 task keeps 09:00 when it rolls across the clock change', () => {
  // 19 October is British Summer Time (09:00 is 08:00 UTC); 26 October is
  // GMT (09:00 is 09:00 UTC). The task's own due_time says 09:00, so the
  // rolled due_at has to land on 09:00 local, as snooze does.
  const { db } = setup();
  const id = createTask(db, { title: 'Water the plants', due_day: '2026-10-19', due_time: '09:00', repeat: 'weekly' }, { now });
  const rolled = changeTask(db, 'toggle', { id }, { now: new Date('2026-10-19T10:00:00Z') });
  assert.equal(rolled.due_time, '09:00');
  assert.equal(wallTime(new Date(rolled.due_at)), '09:00');
  assert.equal(rolled.due_at, '2026-10-26T09:00:00.000Z');
});

test('toggling a one-off task completes it, stops its clock, and toggling again reopens it', () => {
  const { db, task } = setup();
  const id = createTask(db, { title: 'Return the library book' }, { now });
  changeTask(db, 'start', { id }, { now });
  assert.equal(task(id).status, 'in_progress');
  const later = new Date(now.getTime() + 25 * 60000);
  const done = changeTask(db, 'toggle', { id }, { now: later });
  assert.equal(done.status, 'done');
  assert.equal(done.completed_at, later.toISOString());
  assert.equal(done.priority_started_at, null);
  assert.deepEqual(done.time_log, [{ start: now.toISOString(), end: later.toISOString(), minutes: 25 }]);
  const open = changeTask(db, 'toggle', { id }, { now: later });
  assert.equal(open.status, 'ready');
  assert.equal(open.completed_at, null);
});

test('the other actions change one task each, and delete keeps it as cancelled', () => {
  const { db, task } = setup();
  const id = createTask(db, { title: 'Call the bank', due_day: '2026-10-05', due_time: '16:00' }, { now });
  assert.equal(changeTask(db, 'rename', { id, title: ' Call the bank about the card ' }, { now }).title, 'Call the bank about the card');
  assert.equal(changeTask(db, 'estimate', { id, estimate_minutes: 20 }, { now }).estimate_minutes, 20);
  assert.equal(changeTask(db, 'estimate', { id, estimate_minutes: null }, { now }).estimate_minutes, null);
  // Snooze: the next local day at the same wall time.
  assert.equal(changeTask(db, 'snooze', { id }, { now }).due_at, '2026-10-06T15:00:00.000Z');
  const pinned = changeTask(db, 'pin', { id, on: true }, { now });
  assert.deepEqual([pinned.is_priority, pinned.status], [true, 'in_progress']);
  const unpinned = changeTask(db, 'pin', { id, on: false }, { now });
  assert.deepEqual([unpinned.is_priority, unpinned.status], [false, 'ready']);
  const dismissed = changeTask(db, 'dismiss', { id }, { now });
  assert.deepEqual([dismissed.due_at, dismissed.asap], [null, true]);
  const deleted = changeTask(db, 'delete', { id }, { now });
  assert.equal(deleted.status, 'cancelled');
  assert.equal(task(id), undefined, 'a deleted task leaves the list');
  assert.equal(db.prepare('SELECT status FROM task_items WHERE id = ?').get(id).status, 'cancelled');
});

test('an unknown action or task is refused', () => {
  const { db } = setup();
  const id = createTask(db, { title: 'Call the bank' }, { now });
  assert.throws(() => changeTask(db, 'explode', { id }, { now }), /Unknown action/);
  assert.throws(() => changeTask(db, 'toPrototype', { id }, { now }), /Unknown action/);
  assert.throws(() => changeTask(db, 'toggle', { id: 'no-such-task' }, { now }), /Task not found/);
  assert.throws(() => changeTask(db, 'rename', { id, title: '  ' }, { now }), /A task needs a title/);
  assert.throws(() => changeTask(db, 'estimate', { id }, { now }), /Send estimate_minutes/);
});
