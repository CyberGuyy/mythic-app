import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consistency, mondayOf, WEEKS } from './consistency.js';

const TODAY = '2026-09-23';   // a Wednesday
const task = (id, fields) => ({ id, title: id, status: 'ready', project_id: 'p1', due_at: null, completed_at: null, ...fields });
const stateOf = tasks => ({ tasks_by_id: Object.fromEntries(tasks.map(t => [t.id, t])) });
const cell = (map, day) => map.weeks.flat().find(c => c.day === day);

test('four rows of Monday to Sunday, the last holding today, days after today marked future', () => {
  assert.equal(mondayOf(TODAY), '2026-09-21');
  assert.equal(mondayOf('2026-09-21'), '2026-09-21');
  assert.equal(mondayOf('2026-09-27'), '2026-09-21');
  const map = consistency(stateOf([]), TODAY);
  assert.equal(map.weeks.length, WEEKS);
  assert.equal(WEEKS, 4);
  assert.ok(map.weeks.every(row => row.length === 7));
  assert.equal(map.weeks[0][0].day, '2026-08-31');
  assert.equal(map.weeks[3][6].day, '2026-09-27');
  assert.equal(cell(map, TODAY).future, undefined);
  assert.equal(cell(map, '2026-09-24').future, true);
  assert.equal(map.share_pct, 0);
  assert.equal(map.best_run, 0);
});

test('planned is due-that-day plus completed-that-day, done is completed that day, each task once', () => {
  const map = consistency(stateOf([
    task('a', { due_at: '2026-09-21T09:00:00Z' }),                                                            // planned Mon, open
    task('b', { due_at: '2026-09-21T09:00:00Z', status: 'done', completed_at: '2026-09-21T15:00:00Z' }),      // planned and done Mon, counted once
    task('c', { status: 'done', completed_at: '2026-09-22T08:00:00Z' }),                                      // done Tue with no due day
    task('d', { due_at: '2026-09-22T09:00:00Z', status: 'cancelled' }),                                       // cancelled: nothing
    task('e', { due_at: '2026-09-22T09:00:00Z', project_id: null }),                                          // no project: nothing
    task('f', { due_at: '2026-09-20T23:30:00Z' }),                                                            // 00:30 London on Monday 21
  ]), TODAY);
  assert.deepEqual(cell(map, '2026-09-21'), { day: '2026-09-21', planned: 3, done: 1, v: 1 / 3 });
  assert.deepEqual(cell(map, '2026-09-22'), { day: '2026-09-22', planned: 1, done: 1, v: 1 });
  assert.equal(cell(map, '2026-09-20').planned, 0);
  assert.equal(map.best_run, 2);
});

test('the figures: working days that moved a project, and the best run over any day', () => {
  // Done on Friday, Saturday, Sunday and Monday: a run of four, two working days.
  const days = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21'];
  const map = consistency(stateOf(days.map((day, index) => task('t' + index, { status: 'done', completed_at: day + 'T12:00:00Z' }))), TODAY);
  assert.equal(map.best_run, 4);
  // Working days in the window up to Wednesday 23 September: 3 full weeks and three days.
  assert.equal(map.share_pct, Math.round(2 / (3 * 5 + 3) * 100));
  assert.deepEqual(JSON.parse(JSON.stringify(map)), map);
});

test('tasks outside the window are ignored', () => {
  // Sunday 30 August is the day before the window's first Monday.
  const map = consistency(stateOf([task('old', { status: 'done', completed_at: '2026-08-30T12:00:00Z' })]), TODAY);
  assert.equal(map.weeks.flat().reduce((sum, c) => sum + c.done, 0), 0);
});

test('no project tasks at all: 0% and a best run of 0, never NaN', () => {
  const finite = map => map.weeks.flat().every(c => Number.isFinite(c.v) && Number.isFinite(c.planned) && Number.isFinite(c.done));
  for (const state of [{}, { tasks_by_id: {} }, stateOf([task('loose', { project_id: null, status: 'done', completed_at: '2026-09-22T12:00:00Z' })])]) {
    const map = consistency(state, TODAY);
    assert.equal(map.share_pct, 0);
    assert.equal(map.best_run, 0);
    assert.ok(finite(map));
    assert.ok(!JSON.stringify(map).includes('NaN') && !JSON.stringify(map).includes('null'));
  }
  // A window with no working days in it still divides safely.
  const map = consistency(stateOf([]), TODAY, 0);
  assert.equal(map.share_pct, 0);
  assert.deepEqual(map.weeks, []);
});

test('every week row carries 7 days whatever the weekday, with the days after today flagged future and empty', () => {
  // Monday 21 to Sunday 27 September 2026: today at each position in the last row.
  for (let offset = 0; offset < 7; offset += 1) {
    const today = `2026-09-${String(21 + offset).padStart(2, '0')}`;
    const map = consistency(stateOf([task('ahead', { due_at: '2026-09-27T12:00:00Z' })]), today);
    assert.equal(map.weeks.length, WEEKS);
    assert.ok(map.weeks.every(row => row.length === 7));
    const last = map.weeks[WEEKS - 1];
    assert.deepEqual(last.map(c => c.day), ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
    last.forEach((c, d) => {
      if (d > offset) assert.deepEqual(c, { day: c.day, planned: 0, done: 0, v: 0, future: true });
      else assert.equal(c.future, undefined);
    });
    assert.ok(map.weeks.slice(0, -1).flat().every(c => !c.future));
  }
});
