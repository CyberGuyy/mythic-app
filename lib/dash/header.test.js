import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tasks, emptyPlanning } from '../planning-models.js';
import { newTaskInput, setPriority } from '../task-list.js';
import { completeTask } from '../simple/tasks-view.js';
import { dayLabels, headerData, loadHeader, restLabel, urgentCount } from './header.js';

// Sunday 20 September 2026, 13:12 in London (BST, UTC+1).
const now = new Date('2026-09-20T12:12:00Z');
const id = n => `0000000${n}-0000-4000-8000-000000000000`;

function seed() {
  let state = emptyPlanning();
  const add = (n, title, due_at) => { state = Tasks.addTask(state, newTaskInput({ id: id(n), title, due_at })); };
  add(1, 'Reply to the landlord', '2026-09-18T09:00:00Z');   // overdue
  add(2, 'Cut the short film', '2026-09-20T14:00:00Z'); // due today
  add(3, 'Book the boiler', '2026-09-20T08:00:00Z');      // due today, finished below
  add(4, 'Draft the rate card', null);                    // no date: not today's
  add(5, 'Price a lens', '2026-09-24T09:00:00Z');         // upcoming: not today's
  add(6, 'Old errand', '2026-09-10T09:00:00Z');           // finished yesterday: not today's
  state = completeTask(state, id(3), new Date('2026-09-20T09:30:00Z'));
  state = completeTask(state, id(6), new Date('2026-09-19T18:00:00Z'));
  return state;
}

test('the day labels name the weekday in English and Japanese and the ISO week', () => {
  assert.deepEqual(dayLabels('2026-09-20'), { weekday: 'Sunday', date_label: '20 September', day_label: 'Sunday 20 September', weekday_jp: '日曜日', week: 38 });
  assert.equal(dayLabels('2026-09-21').weekday_jp, '月曜日');
  assert.equal(dayLabels('2026-09-26').weekday_jp, '土曜日');
  assert.equal(dayLabels('2027-01-01').week, 53);
  assert.throws(() => dayLabels('20 Sep'), /YYYY-MM-DD/);
});

test("today's score counts due today and overdue, plus what was finished today", () => {
  const data = headerData(seed(), { now, today: '2026-09-20' });
  assert.equal(data.day_label, 'Sunday 20 September');
  assert.equal(data.time_label, '13:12');
  assert.equal(data.week, 38);
  assert.deepEqual({ done: data.done, total: data.total, left: data.left, urgent: data.urgent, pct: data.pct }, { done: 1, total: 3, left: 2, urgent: 1, pct: 33 });
  assert.equal(data.day, '2026-09-20');
  assert.equal(data.rest, '2 left today, 1 urgent');
  assert.doesNotThrow(() => JSON.stringify(data));
});

test('urgent is overdue or priority, each task once, and differs from left today', () => {
  let state = seed();
  // Due today but not priority: left today, not urgent.
  assert.equal(urgentCount(state, '2026-09-20'), 1);
  // Priority on a task due today, on one with no date and on the overdue one.
  state = setPriority(state, id(2), true, now);
  state = setPriority(state, id(4), true, now);
  state = setPriority(state, id(1), true, now);
  const data = headerData(state, { now, today: '2026-09-20' });
  assert.deepEqual({ left: data.left, urgent: data.urgent }, { left: 2, urgent: 3 });
  assert.equal(data.rest, '2 left today, 3 urgent');
  // A finished priority task is not urgent any more.
  state = completeTask(state, id(4), new Date('2026-09-20T11:00:00Z'));
  assert.equal(urgentCount(state, '2026-09-20'), 2);
  // The London day decides overdue: due 23:30 UTC on the 19th is the 20th in BST.
  let late = emptyPlanning();
  late = Tasks.addTask(late, newTaskInput({ id: id(7), title: 'Late night', due_at: '2026-09-19T23:30:00Z' }));
  assert.equal(urgentCount(late, '2026-09-20'), 0);
  assert.equal(urgentCount(late, '2026-09-21'), 1);
});

test('the subline tail reads left and urgent, and leaves a zero urgent out', () => {
  assert.equal(restLabel({ left: 3, urgent: 1, total: 8 }), '3 left today, 1 urgent');
  assert.equal(restLabel({ left: 3, urgent: 0, total: 8 }), '3 left today');
  assert.equal(restLabel({ left: 0, urgent: 0, total: 5 }), 'all done today');
  assert.equal(restLabel({ left: 0, urgent: 2, total: 5 }), 'all done today, 2 urgent');
  assert.equal(restLabel({ left: 0, urgent: 0, total: 0 }), 'nothing due today');
  assert.equal(restLabel({ left: 0, urgent: 1, total: 0 }), 'nothing due today, 1 urgent');
});

test('an empty day scores zero instead of dividing by nothing', () => {
  const data = headerData(emptyPlanning(), { now, today: '2026-09-20' });
  assert.deepEqual({ done: data.done, total: data.total, left: data.left, urgent: data.urgent, pct: data.pct }, { done: 0, total: 0, left: 0, urgent: 0, pct: 0 });
  assert.equal(data.rest, 'nothing due today');
});

test('the time is the London wall clock, not the machine clock', () => {
  assert.equal(headerData(emptyPlanning(), { now: new Date('2026-12-20T13:12:00Z'), today: '2026-12-20' }).time_label, '13:12');
  assert.equal(headerData(emptyPlanning(), { now: new Date('2026-07-01T23:30:00Z'), today: '2026-07-02' }).time_label, '00:30');
});

test('an unreadable planning file is an error, not an empty day', async () => {
  await assert.rejects(loadHeader({ state: null, now, today: '2026-09-20' }), /Tasks are unavailable right now\./);
});

test('the sky draws in a fixed number of fills and repeats itself exactly', async () => {
  const { seeded, drawHalftone, SKIES } = await import('../../components/dash/widgets/sky.js');
  assert.deepEqual(Object.keys(SKIES), ['halftone'], 'only Yoru\'s sky is left');
  // The faster generator gives the mockups' Park-Miller sequence exactly.
  const reference = (() => { let seed = 11; return () => (seed = (seed * 16807) % 2147483647) / 2147483647; })();
  const fast = seeded(11);
  for (let k = 0; k < 100000; k += 1) assert.equal(fast(), reference());

  const record = () => {
    const log = { rects: [], fills: 0, alphas: new Set() };
    return { log, ctx: { rect: (x, y) => log.rects.push(x, y), fillRect: (x, y) => log.rects.push(x, y), beginPath() {}, fill: () => { log.fills += 1; }, set globalAlpha(value) { log.alphas.add(value); }, set fillStyle(value) {} } };
  };
  const h = record(), again = record();
  drawHalftone(h.ctx, 1440, 330);
  drawHalftone(again.ctx, 1440, 330);
  assert.ok(h.log.rects.length / 2 < 1440 * 330 / 49 + 200);
  assert.deepEqual(h.log.rects, again.log.rects);
});
