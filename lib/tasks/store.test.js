import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from '../db.js';
import { Tasks, emptyPlanning } from '../planning-models.js';
import { newTaskInput } from '../task-list.js';
import { ensureTasks, readTasks, mutateTasks } from './store.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const row = (db, id) => db.prepare('SELECT * FROM task_items WHERE id = ?').get(id);

function seeded() {
  const db = memoryDb();
  mutateTasks(db, state => {
    let next = Tasks.addTask(state, newTaskInput({ id: A, title: 'Book the dentist', section: 'life' }));
    next = Tasks.addTask(next, newTaskInput({ id: B, title: 'Fix the tap', section: 'home' }));
    return next;
  });
  return db;
}

test('an empty database reads as an empty task state', () => {
  const db = memoryDb();
  assert.deepEqual(readTasks(db), emptyPlanning());
  // ensureTasks is safe to run again.
  ensureTasks(db);
  assert.deepEqual(readTasks(db), emptyPlanning());
});

test('what mutateTasks writes, readTasks reads back, one row per task', () => {
  const db = memoryDb();
  const { state, result } = mutateTasks(db, (before, context) => {
    assert.deepEqual(before, emptyPlanning());
    context.id = A;
    return Tasks.addTask(before, newTaskInput({ id: A, title: 'Book the dentist', section: 'life' }));
  });
  assert.deepEqual(result, { id: A });
  const read = readTasks(db);
  assert.deepEqual(read, state);
  assert.equal(read.tasks_by_id[A].title, 'Book the dentist');
  assert.equal(read.tasks_by_id[A].section, 'life');
  assert.equal(read.tasks_by_id[A].owner, 'me');
  const stored = row(db, A);
  assert.equal(stored.status, 'ready');
  assert.equal(stored.updated_at, read.tasks_by_id[A].updated_at);
  assert.deepEqual(JSON.parse(stored.json), read.tasks_by_id[A]);
});

test('a change rewrites only the rows it changed, and a transform that returns nothing keeps the state', () => {
  const db = seeded();
  db.prepare("UPDATE task_items SET updated_at = 'untouched'").run();
  mutateTasks(db, state => Tasks.updateTask(state, A, { title: 'Book the dentist for Monday' }));
  assert.equal(readTasks(db).tasks_by_id[A].title, 'Book the dentist for Monday');
  assert.notEqual(row(db, A).updated_at, 'untouched');
  assert.equal(row(db, B).updated_at, 'untouched', 'an unchanged task is not written again');
  const before = readTasks(db);
  assert.deepEqual(mutateTasks(db, () => undefined).state, before);
  assert.deepEqual(readTasks(db), before);
});

test('cancelled tasks are kept in the table but left out of the state', () => {
  const db = seeded();
  mutateTasks(db, state => Tasks.updateTask(state, A, { status: 'cancelled' }));
  assert.deepEqual(Object.keys(readTasks(db).tasks_by_id), [B]);
  assert.equal(row(db, A).status, 'cancelled');
  assert.equal(JSON.parse(row(db, A).json).title, 'Book the dentist');
});

test('a task removed from the state is kept as cancelled, so nothing is lost', () => {
  const db = seeded();
  const { state } = mutateTasks(db, before => {
    const next = structuredClone(before);
    delete next.tasks_by_id[A];
    return next;
  });
  assert.deepEqual(Object.keys(state.tasks_by_id), [B]);
  assert.deepEqual(Object.keys(readTasks(db).tasks_by_id), [B]);
  const kept = row(db, A);
  assert.equal(kept.status, 'cancelled');
  const task = JSON.parse(kept.json);
  assert.equal(task.status, 'cancelled');
  assert.equal(task.title, 'Book the dentist');
  assert.equal(task.section, 'life');
  assert.equal(task.updated_at, kept.updated_at);
});

test('a transform that throws writes nothing', () => {
  const db = seeded();
  const before = readTasks(db);
  assert.throws(() => mutateTasks(db, state => {
    Tasks.updateTask(state, A, { title: 'Half done' });
    throw new Error('Stop here.');
  }), /Stop here/);
  assert.throws(() => mutateTasks(db, state => Tasks.addTask(state, { id: B, title: 'Duplicate' })), /already exists/);
  assert.deepEqual(readTasks(db), before);
});

test('a row that no longer parses is skipped, never shown half-read', () => {
  const db = seeded();
  db.prepare("INSERT INTO task_items (id, json, status, updated_at) VALUES ('broken', '{not json', 'ready', 'x')").run();
  db.prepare("INSERT INTO task_items (id, json, status, updated_at) VALUES ('no-id', '{\"title\":\"x\"}', 'ready', 'x')").run();
  assert.deepEqual(Object.keys(readTasks(db).tasks_by_id).sort(), [A, B]);
});
