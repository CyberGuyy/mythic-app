import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tasks, emptyPlanning } from '../planning-models.js';
import { newTaskInput } from '../task-list.js';
import { localToday } from '../day.js';
import { REPEATS, VIEWS, GROUP_LABELS, repeatOf, dueTimeOf, dueGroupOf, rollForward, completeTask, simpleTasks, dueLabel, parseAddLine, dueAtForDay, reminderAt } from './tasks-view.js';

const now = new Date('2026-09-15T10:00:00Z');
const ID = {
  overdue: '11111111-1111-4111-8111-111111111111',
  today: '22222222-2222-4222-8222-222222222222',
  soon: '33333333-3333-4333-8333-333333333333',
  undated: '44444444-4444-4444-8444-444444444444',
  weekly: '55555555-5555-4555-8555-555555555555',
};

function seed() {
  let state = emptyPlanning();
  state = Tasks.addTask(state, newTaskInput({ id: ID.overdue, title: 'Send the client invoice', section: 'work', due_at: '2026-09-12T09:00:00Z' }));
  state = Tasks.addTask(state, newTaskInput({ id: ID.today, title: 'Read a chapter', section: 'life', due_at: '2026-09-15T18:00:00Z' }));
  state = Tasks.addTask(state, newTaskInput({ id: ID.soon, title: 'Book the dentist', section: 'home', due_at: '2026-09-17T09:00:00Z' }));
  state = Tasks.addTask(state, newTaskInput({ id: ID.undated, title: 'Finish the side project', section: 'work' }));
  state = Tasks.addTask(state, newTaskInput({ id: ID.weekly, title: 'Weekly review', section: 'work', due_at: '2026-09-15T20:00:00Z' }));
  state = Tasks.updateTask(state, ID.weekly, { repeat: 'weekly', due_time: '20:00' });
  return state;
}

test('the field helpers read what is set and fall back cleanly', () => {
  assert.deepEqual(REPEATS, ['none', 'daily', 'weekly', 'monthly']);
  assert.deepEqual(VIEWS, ['all', 'today', 'upcoming', 'none', 'done']);
  assert.equal(repeatOf({ repeat: 'weekly' }), 'weekly');
  assert.equal(repeatOf({ repeat: 'yearly' }), 'none');
  assert.equal(repeatOf({}), 'none');
  assert.equal(dueTimeOf({ due_time: '09:30' }), '09:30');
  assert.equal(dueTimeOf({ due_time: '25:00' }), null);
  assert.equal(dueTimeOf({}), null);
});

test('a task is grouped by its local due day', () => {
  assert.equal(dueGroupOf({ due_at: '2026-09-14T23:30:00Z' }, '2026-09-15'), 'today');
  assert.equal(dueGroupOf({ due_at: '2026-09-14T09:00:00Z' }, '2026-09-15'), 'overdue');
  assert.equal(dueGroupOf({ due_at: '2026-09-15T18:00:00Z' }, '2026-09-15'), 'today');
  assert.equal(dueGroupOf({ due_at: '2026-09-16T08:00:00Z' }, '2026-09-15'), 'upcoming');
  assert.equal(dueGroupOf({ due_at: null }, '2026-09-15'), 'none');
});

test('the due label names today, a weekday within the week, then a date', () => {
  assert.equal(dueLabel({ due_at: '2026-09-15T18:00:00Z' }, '2026-09-15'), 'DUE TODAY');
  assert.equal(dueLabel({ due_at: '2026-09-12T09:00:00Z' }, '2026-09-15'), 'OVERDUE');
  assert.equal(dueLabel({ due_at: '2026-09-17T09:00:00Z' }, '2026-09-15'), 'DUE THU');
  assert.equal(dueLabel({ due_at: '2026-09-28T09:00:00Z' }, '2026-09-15'), 'DUE 28 SEP');
  assert.equal(dueLabel({ due_at: null }, '2026-09-15'), '');
});

test('the due label reads the local day, not the UTC one', () => {
  // 23:30 UTC in British Summer Time is half past midnight the next morning in
  // London, so the label has to name the day the task was grouped under.
  const friday = { due_at: '2026-09-17T23:30:00Z' };
  assert.equal(dueGroupOf(friday, '2026-09-15'), 'upcoming');
  assert.equal(dueLabel(friday, '2026-09-15'), 'DUE FRI');
  assert.equal(dueLabel({ due_at: '2026-09-28T23:30:00Z' }, '2026-09-15'), 'DUE 29 SEP');
});

test('roll forward advances past now for each repeat and clamps a short month', () => {
  assert.equal(rollForward('2026-09-14T09:00:00Z', 'daily', now), '2026-09-16T09:00:00.000Z');
  assert.equal(rollForward('2026-09-15T20:00:00Z', 'weekly', now), '2026-09-22T20:00:00.000Z');
  assert.equal(rollForward('2026-09-15T20:00:00Z', 'monthly', now), '2026-10-15T20:00:00.000Z');
  // 31 January monthly lands on the last day of February, not on 3 March.
  assert.equal(rollForward('2026-01-31T09:00:00Z', 'monthly', new Date('2026-02-01T10:00:00Z')), '2026-02-28T09:00:00.000Z');
  // A task overdue by weeks still only moves to the next instant after now.
  assert.equal(rollForward('2026-08-01T09:00:00Z', 'weekly', now), '2026-09-19T09:00:00.000Z');
  // A repeating task with no date starts from now.
  assert.equal(rollForward(null, 'daily', now), '2026-09-16T10:00:00.000Z');
  assert.equal(rollForward('2026-09-15T20:00:00Z', 'none', now), null);
});

test('ticking a repeating task rolls it forward and keeps it open', () => {
  let state = seed();
  state = completeTask(state, ID.weekly, now);
  assert.equal(state.tasks_by_id[ID.weekly].status, 'ready');
  assert.equal(state.tasks_by_id[ID.weekly].due_at, '2026-09-22T20:00:00.000Z');
  assert.equal(state.tasks_by_id[ID.weekly].asap, false);
});

test('ticking a one-off task completes it, and ticking it again restores it', () => {
  let state = seed();
  state = completeTask(state, ID.today, now);
  assert.equal(state.tasks_by_id[ID.today].status, 'done');
  // The completion is stamped from the clock the caller passed in, so the done
  // view is the same on any machine on any day.
  assert.equal(state.tasks_by_id[ID.today].completed_at, now.toISOString());
  state = completeTask(state, ID.today, now);
  assert.equal(state.tasks_by_id[ID.today].status, 'ready');
  assert.equal(state.tasks_by_id[ID.today].completed_at, null);
});

test('a repeating task with a time but no date rolls from that time today', () => {
  let state = seed();
  state = Tasks.updateTask(state, ID.undated, { repeat: 'daily', due_time: '09:00' });
  state = completeTask(state, ID.undated, now);
  // 09:00 London on 16 September is 08:00 UTC, British Summer Time.
  assert.equal(state.tasks_by_id[ID.undated].due_at, '2026-09-16T08:00:00.000Z');
  assert.equal(state.tasks_by_id[ID.undated].status, 'ready');
});

test('the all view groups overdue, today, upcoming and no date, in that order', () => {
  const { groups, counts } = simpleTasks(seed(), { view: 'all', now });
  assert.deepEqual(groups.map(group => group.label), [GROUP_LABELS.overdue, GROUP_LABELS.today, GROUP_LABELS.upcoming, GROUP_LABELS.none]);
  assert.deepEqual(groups[1].tasks.map(task => task.title), ['Read a chapter', 'Weekly review']);
  assert.equal(counts.all, 5);
  assert.equal(counts.overdue, 1);
  assert.equal(counts.due_today, 2);
  assert.equal(counts.today, 3);
  assert.equal(counts.upcoming, 1);
  assert.equal(counts.none, 1);
  assert.equal(counts.work, 3);
  assert.equal(counts.life, 1);
  assert.equal(counts.home, 1);
});

test('a pinned task comes first inside its group, then due time, then created', () => {
  let state = seed();
  state = Tasks.updateTask(state, ID.weekly, { is_priority: true });
  const { groups } = simpleTasks(state, { view: 'all', now });
  const today = groups.find(group => group.key === 'today');
  assert.deepEqual(today.tasks.map(task => task.title), ['Weekly review', 'Read a chapter']);
  assert.equal(today.tasks[0].is_priority, true);
});

test('the views and the filters narrow the same list', () => {
  const state = seed();
  assert.deepEqual(simpleTasks(state, { view: 'today', now }).groups.map(group => group.key), ['overdue', 'today']);
  assert.deepEqual(simpleTasks(state, { view: 'upcoming', now }).groups.map(group => group.key), ['upcoming']);
  assert.deepEqual(simpleTasks(state, { view: 'none', now }).groups.map(group => group.key), ['none']);
  const work = simpleTasks(state, { view: 'all', domain: 'work', now });
  assert.equal(work.groups.flatMap(group => group.tasks).length, 3);
  // The counts stay whole-list counts so the rail does not change under a filter.
  assert.equal(work.counts.all, 5);
  let pinned = Tasks.updateTask(state, ID.undated, { is_priority: true });
  const only = simpleTasks(pinned, { view: 'all', pinnedOnly: true, now });
  assert.deepEqual(only.groups.flatMap(group => group.tasks).map(task => task.title), ['Finish the side project']);
  assert.equal(only.counts.pinned, 1);
});

test('the done view shows only what was finished on the local day', () => {
  let state = seed();
  state = completeTask(state, ID.today, now);
  state.tasks_by_id[ID.overdue].status = 'done';
  state.tasks_by_id[ID.overdue].completed_at = '2026-09-13T12:00:00Z';
  const { groups, counts } = simpleTasks(state, { view: 'done', now });
  assert.deepEqual(groups.map(group => group.label), [GROUP_LABELS.done]);
  assert.deepEqual(groups[0].tasks.map(task => task.title), ['Read a chapter']);
  assert.equal(counts.done, 1);
});

test('the done view answers the same on any machine clock', () => {
  // A different day, a different month, and the run still has to agree, so the
  // test never depends on the calendar the machine happens to be showing.
  const winter = new Date('2026-02-03T22:30:00Z');
  let state = completeTask(seed(), ID.today, winter);
  assert.equal(state.tasks_by_id[ID.today].completed_at, winter.toISOString());
  const done = simpleTasks(state, { view: 'done', now: winter });
  assert.deepEqual(done.groups[0].tasks.map(task => task.title), ['Read a chapter']);
  assert.equal(done.counts.done, 1);
  // Asking on the real machine day finds nothing, unless that day is 3 February.
  const empty = simpleTasks(state, { view: 'done', now: new Date() });
  assert.equal(empty.counts.done, localToday() === '2026-02-03' ? 1 : 0);
});

test('the last 7 days toggle adds a done group, newest first, and replaces today on the done view', () => {
  let state = seed();
  state = completeTask(state, ID.today, now);
  state.tasks_by_id[ID.overdue].status = 'done';
  state.tasks_by_id[ID.overdue].completed_at = new Date(now.getTime() - 6 * 86400000).toISOString();
  state.tasks_by_id[ID.undated].status = 'done';
  state.tasks_by_id[ID.undated].completed_at = new Date(now.getTime() - 8 * 86400000).toISOString();
  const off = simpleTasks(state, { view: 'all', now });
  assert.equal(off.groups.some(group => group.key === 'done_week'), false);
  assert.equal(off.counts.done_week, 2);
  const on = simpleTasks(state, { view: 'all', doneWeek: true, now });
  const last = on.groups.at(-1);
  assert.equal(last.label, GROUP_LABELS.done_week);
  assert.deepEqual(last.tasks.map(task => task.id), [ID.today, ID.overdue]);
  const done = simpleTasks(state, { view: 'done', doneWeek: true, now });
  assert.deepEqual(done.groups.map(group => group.key), ['done_week']);
  const work = simpleTasks(state, { view: 'all', doneWeek: true, domain: 'life', now });
  assert.equal(work.groups.at(-1).tasks.every(task => task.section === 'life'), true);
});

test('an unknown view is refused by name', () => {
  assert.throws(() => simpleTasks(seed(), { view: 'everything', now }), /Choose a view: all, today, upcoming, none, done\./);
});

test('a shaped row carries what the row needs and nothing else to compute', () => {
  const { groups } = simpleTasks(seed(), { view: 'all', now });
  const row = groups.find(group => group.key === 'today').tasks.find(task => task.title === 'Weekly review');
  assert.equal(row.section, 'work');
  assert.equal(row.repeat, 'weekly');
  assert.equal(row.due_time, '20:00');
  assert.equal(row.owner_label, 'you');
  assert.equal(row.due_label, 'DUE TODAY');
  assert.equal(row.group, 'today');
});

test('an add line picks a domain from its prefix', () => {
  assert.deepEqual(parseAddLine('Send the invoice'), { title: 'Send the invoice', section: 'work' });
  assert.deepEqual(parseAddLine('life: read 20 pages'), { title: 'read 20 pages', section: 'life' });
  assert.deepEqual(parseAddLine('HOME:  fix the tap '), { title: 'fix the tap', section: 'home' });
  assert.deepEqual(parseAddLine('work:'), { title: '', section: 'work' });
});

test('a row carries its project and whether a reminder is set', () => {
  let state = seed();
  state = Tasks.updateTask(state, ID.today, { project_id: 'p-1', reminder: { id: '99999999-9999-4999-8999-999999999999', at: '2026-09-15T08:00:00.000Z', channel: 'telegram' } });
  const { groups, counts } = simpleTasks(state, { view: 'all', project: 'p-1', now });
  const rows = groups.flatMap(group => group.tasks);
  assert.deepEqual(rows.map(task => task.title), ['Read a chapter']);
  assert.equal(rows[0].project_id, 'p-1');
  assert.equal(rows[0].remind, true);
  assert.deepEqual(counts.by_project, { 'p-1': 1 });
  assert.equal(simpleTasks(state, { view: 'all', now }).groups.flatMap(group => group.tasks).find(task => task.id === ID.undated).remind, false);
});

test('a due day and a time become one local instant, and 09:00 stands in for no time', () => {
  // British Summer Time: 09:00 London is 08:00 UTC.
  assert.equal(dueAtForDay('2026-09-16', '09:00'), '2026-09-16T08:00:00.000Z');
  assert.equal(dueAtForDay('2026-09-16', null), '2026-09-16T08:00:00.000Z');
  assert.equal(dueAtForDay('2026-12-16', '09:00'), '2026-12-16T09:00:00.000Z');
  assert.throws(() => dueAtForDay('tomorrow', '09:00'), /YYYY-MM-DD/);
});

test('a reminder lands on the due day at the due time, or at 09:00, and never in the past', () => {
  assert.equal(reminderAt({ due_at: '2026-09-17T15:00:00.000Z', due_time: '08:30' }, now), '2026-09-17T07:30:00.000Z');
  assert.equal(reminderAt({ due_at: '2026-09-17T15:00:00.000Z' }, now), '2026-09-17T15:00:00.000Z');
  assert.equal(reminderAt({ due_at: null }, now), now.toISOString());
  assert.equal(reminderAt({ due_at: '2026-09-15T06:00:00.000Z' }, now), now.toISOString());
});

test('a rolled repeat carries its phone reminder to the new date with a new id', () => {
  const rid = '6d4f2b1e-9c3a-4e7b-8f21-3a5c7d9e1b24';
  let state = Tasks.addTask(emptyPlanning(), newTaskInput({ id: rid, title: 'Weekly', section: 'life', due_at: '2026-09-18T13:30:00.000Z' }));
  state = Tasks.updateTask(state, rid, { repeat: 'weekly', due_time: '14:30', reminder: { id: 'old', at: '2026-09-18T13:30:00.000Z', channel: 'telegram' } });
  const next = completeTask(state, rid, new Date('2026-09-18T15:00:00.000Z'));
  const task = next.tasks_by_id[rid];
  assert.equal(task.status, 'ready');
  assert.equal(task.due_at.slice(0, 10), '2026-09-25');
  assert.notEqual(task.reminder.id, 'old');
  assert.equal(task.reminder.at, '2026-09-25T13:30:00.000Z');
});
