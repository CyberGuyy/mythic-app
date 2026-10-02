import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tasks, emptyPlanning } from './planning-models.js';
import { SECTIONS, TABS, newTaskInput, sectionOf, ownerOf, taskList, setPriority, staleTasks } from './task-list.js';

const now = new Date('2026-09-14T15:00:00Z');
function seed() {
  let state = emptyPlanning();
  state = Tasks.addTask(state, newTaskInput({ id: '11111111-1111-4111-8111-111111111111', title: 'Read 20 pages of a novel', section: 'life', owner: 'you', asap: true }));
  state = Tasks.addTask(state, newTaskInput({ id: '22222222-2222-4222-8222-222222222222', title: 'Write the weekly newsletter', section: 'life', owner: 'agent', due_at: '2026-09-14T18:00:00Z', asap: false }));
  state = Tasks.addTask(state, newTaskInput({ id: '33333333-3333-4333-8333-333333333333', title: 'Finish the side project', section: 'work', owner: 'you', asap: true }));
  state = Tasks.addTask(state, { id: '44444444-4444-4444-8444-444444444444', title: 'Old task without a section', owner: 'me', status: 'ready', created_at: '2026-08-20T10:00:00Z', updated_at: '2026-08-20T10:00:00Z' });
  // addTask stamps updated_at with the real clock. Age the record the way an
  // untouched task would look.
  state.tasks_by_id['44444444-4444-4444-8444-444444444444'].updated_at = '2026-08-20T10:00:00Z';
  return state;
}

test('sections and tabs are fixed and unlabelled tasks fall into work', () => {
  assert.deepEqual(SECTIONS, ['work', 'life', 'home']);
  assert.deepEqual(TABS, ['all', 'work', 'life', 'home']);
  assert.equal(sectionOf({ section: 'life' }), 'life');
  assert.equal(sectionOf({}), 'work');
  assert.equal(ownerOf({ owner: 'agent' }), 'agent');
  assert.equal(ownerOf({ owner: 'me' }), 'you');
  assert.equal(ownerOf({}), 'you');
});

test('the list puts priority first, then due today, then asap, then the rest, and filters by tab', () => {
  let state = seed();
  state = setPriority(state, '33333333-3333-4333-8333-333333333333', true, now);
  const all = taskList(state, { tab: 'all', now });
  assert.deepEqual(all.map(t => t.title), ['Finish the side project', 'Write the weekly newsletter', 'Read 20 pages of a novel', 'Old task without a section']);
  assert.equal(all[0].is_priority, true);
  assert.equal(typeof all[0].priority_started_at, 'string');
  assert.deepEqual(taskList(state, { tab: 'life', now }).map(t => t.title), ['Write the weekly newsletter', 'Read 20 pages of a novel']);
  assert.equal(taskList(state, { tab: 'work', now }).length, 2);
});

test('done and cancelled tasks leave the list and priority can be turned off', () => {
  let state = seed();
  state = setPriority(state, '11111111-1111-4111-8111-111111111111', true, now);
  state = setPriority(state, '11111111-1111-4111-8111-111111111111', false, now);
  assert.equal(state.tasks_by_id['11111111-1111-4111-8111-111111111111'].is_priority, false);
  assert.equal(state.tasks_by_id['11111111-1111-4111-8111-111111111111'].priority_started_at, null);
  assert.equal(state.tasks_by_id['11111111-1111-4111-8111-111111111111'].status, 'ready');
  state = Tasks.updateTask(state, '22222222-2222-4222-8222-222222222222', { status: 'cancelled' });
  assert.equal(taskList(state, { tab: 'all', now }).some(t => t.id === '22222222-2222-4222-8222-222222222222'), false);
  state = Tasks.updateTask(state, '11111111-1111-4111-8111-111111111111', { status: 'done' });
  assert.equal(taskList(state, { tab: 'all', now }).some(t => t.id === '11111111-1111-4111-8111-111111111111'), false);
});

test('stale tasks are the ones untouched for the given number of days', () => {
  const state = seed();
  assert.deepEqual(staleTasks(state, { now, days: 14 }).map(t => t.title), ['Old task without a section']);
});

test('newTaskInput fills defaults and refuses a bad section or owner', () => {
  const input = newTaskInput({ title: 'x' });
  assert.equal(input.section, 'work'); assert.equal(input.owner, 'me'); assert.equal(ownerOf(input), 'you');
  assert.equal(input.asap, true); assert.equal(input.status, 'ready');
  assert.equal('confirmation' in input, false); assert.equal('source' in input, false);
  assert.equal(newTaskInput({ title: 'x', owner: 'agent' }).owner, 'agent');
  assert.throws(() => newTaskInput({ title: 'x', section: 'gym' }), /section/);
  assert.throws(() => newTaskInput({ title: 'x', owner: 'dad' }), /owner/);
});

test('turning priority on again keeps the start, so an edit never resets a running clock', () => {
  let state = seed();
  const id = '11111111-1111-4111-8111-111111111111';
  state = setPriority(state, id, true, now);
  state = setPriority(state, id, true, new Date(now.getTime() + 3600000));
  assert.equal(state.tasks_by_id[id].priority_started_at, now.toISOString());
});
