import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { TIMES_OF_DAY, ensureHabits, addHabit, updateHabit, deleteHabit, replaceHabit, checkHabitCount, HABIT_COUNT, listHabits, setHabitCheck, toggleHabitCheck, habitStreak, habitDots, habitsForDay, shiftDay } from './habits.js';

const fresh = () => { const db = new Database(':memory:'); ensureHabits(db); return db; };
const now = new Date('2026-09-15T09:00:00Z');

test('a habit is created, edited, listed and deleted with its checks', () => {
  const db = fresh();
  assert.deepEqual(TIMES_OF_DAY, ['morning', 'afternoon', 'evening']);
  const id = addHabit(db, { name: 'Read 20 pages', time_of_day: 'evening', now });
  assert.equal(listHabits(db).length, 1);
  assert.equal(listHabits(db)[0].name, 'Read 20 pages');
  assert.equal(listHabits(db)[0].active, true);
  updateHabit(db, id, { name: 'Read 30 pages', time_of_day: 'morning', active: false });
  assert.equal(listHabits(db)[0].name, 'Read 30 pages');
  assert.equal(listHabits(db)[0].time_of_day, 'morning');
  assert.equal(listHabits(db)[0].active, false);
  assert.equal(listHabits(db, { activeOnly: true }).length, 0);
  setHabitCheck(db, id, '2026-09-15', true);
  deleteHabit(db, id);
  assert.deepEqual(listHabits(db), []);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM habit_checks').get().n, 0);
});

test('a bad name or time of day is refused', () => {
  const db = fresh();
  assert.throws(() => addHabit(db, { name: '  ', time_of_day: 'morning', now }), /name/i);
  assert.throws(() => addHabit(db, { name: 'Gym', time_of_day: 'night', now }), /morning, afternoon or evening/);
});

test('a check is one row per habit and day, and ticking twice turns it off', () => {
  const db = fresh();
  const id = addHabit(db, { name: 'Gym', time_of_day: 'morning', now });
  assert.equal(toggleHabitCheck(db, id, '2026-09-15'), true);
  assert.equal(toggleHabitCheck(db, id, '2026-09-15'), false);
  assert.equal(setHabitCheck(db, id, '2026-09-15', true), true);
  assert.equal(setHabitCheck(db, id, '2026-09-15', true), true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM habit_checks WHERE habit_id = ?').get(id).n, 1);
});

test('a streak counts back from today, survives a day that is not over yet, and breaks on a gap', () => {
  const db = fresh();
  const id = addHabit(db, { name: 'Gym', time_of_day: 'morning', now });
  assert.equal(habitStreak(db, id, '2026-09-15'), 0);
  for (const day of ['2026-09-13', '2026-09-14', '2026-09-15']) setHabitCheck(db, id, day, true);
  assert.equal(habitStreak(db, id, '2026-09-15'), 3);
  // Today is not ticked yet, so a streak ending yesterday still stands.
  assert.equal(habitStreak(db, id, '2026-09-16'), 3);
  // Two clear days breaks it.
  assert.equal(habitStreak(db, id, '2026-09-17'), 0);
  setHabitCheck(db, id, '2026-09-14', false);
  assert.equal(habitStreak(db, id, '2026-09-15'), 1);
});

test('a streak walks across a month end and across the BST to GMT change', () => {
  const db = fresh();
  const id = addHabit(db, { name: 'Read', time_of_day: 'evening', now });
  for (const day of ['2026-08-30', '2026-08-31', '2026-09-01']) setHabitCheck(db, id, day, true);
  assert.equal(habitStreak(db, id, '2026-09-01'), 3);
  const clocks = addHabit(db, { name: 'Walk', time_of_day: 'morning', now });
  // British Summer Time ends on 25 October 2026; the day walk is plain dates, so it does not slip.
  for (const day of ['2026-10-24', '2026-10-25', '2026-10-26']) setHabitCheck(db, clocks, day, true);
  assert.equal(habitStreak(db, clocks, '2026-10-26'), 3);
  assert.equal(shiftDay('2026-10-26', -1), '2026-10-25');
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDay('2026-02-28', 1), '2026-03-01');
});

test('the last fourteen days come back oldest first with a flag each', () => {
  const db = fresh();
  const id = addHabit(db, { name: 'Gym', time_of_day: 'morning', now });
  setHabitCheck(db, id, '2026-09-15', true);
  setHabitCheck(db, id, '2026-09-10', true);
  const dots = habitDots(db, id, '2026-09-15', 14);
  assert.equal(dots.length, 14);
  assert.equal(dots[0].day, '2026-09-02');
  assert.equal(dots.at(-1).day, '2026-09-15');
  assert.equal(dots.at(-1).checked, true);
  assert.equal(dots.find(dot => dot.day === '2026-09-10').checked, true);
  assert.equal(dots.find(dot => dot.day === '2026-09-11').checked, false);
});

test('the day view carries only active habits, in time order, with tick and streak', () => {
  const db = fresh();
  const evening = addHabit(db, { name: 'Read', time_of_day: 'evening', now });
  addHabit(db, { name: 'Gym', time_of_day: 'morning', now });
  const asleep = addHabit(db, { name: 'Retired', time_of_day: 'morning', now });
  updateHabit(db, asleep, { active: false });
  setHabitCheck(db, evening, '2026-09-14', true);
  setHabitCheck(db, evening, '2026-09-15', true);
  const rows = habitsForDay(db, '2026-09-15');
  assert.deepEqual(rows.map(row => row.name), ['Gym', 'Read']);
  assert.equal(rows[0].checked, false);
  assert.equal(rows[1].checked, true);
  assert.equal(rows[1].streak, 2);
});

test('five habits: add fills a gap, delete and pause trim a surplus, replace swaps one', () => {
  const db = fresh();
  assert.equal(HABIT_COUNT, 5);
  const ids = ['a', 'b', 'c', 'd', 'e'].map(name => { checkHabitCount(db, 'add'); return addHabit(db, { name, time_of_day: 'morning' }); });
  assert.throws(() => checkHabitCount(db, 'add'), /Replace one instead of adding/);
  assert.throws(() => checkHabitCount(db, 'delete', { id: ids[0] }), /instead of deleting/);
  assert.throws(() => checkHabitCount(db, 'update', { id: ids[0], active: false }), /instead of pausing/);
  checkHabitCount(db, 'update', { id: ids[0] });
  checkHabitCount(db, 'replace', { id: ids[0] });
  checkHabitCount(db, 'delete', { id: 'missing' });

  setHabitCheck(db, ids[0], '2026-09-14', true);
  const swim = replaceHabit(db, ids[0], { name: 'Swim', time_of_day: 'evening' });
  assert.deepEqual(listHabits(db).map(habit => habit.name).sort(), ['Swim', 'b', 'c', 'd', 'e']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM habit_checks').get().n, 0);
  assert.throws(() => replaceHabit(db, swim, { name: '', time_of_day: 'morning' }), /name/);
  assert.equal(listHabits(db).length, 5, 'a refused replace keeps the old habit');
  assert.throws(() => replaceHabit(db, 'missing', { name: 'x', time_of_day: 'morning' }), /not found/);

  const sixth = addHabit(db, { name: 'f', time_of_day: 'morning' });
  checkHabitCount(db, 'delete', { id: sixth });
  checkHabitCount(db, 'update', { id: sixth, active: false });
  updateHabit(db, sixth, { active: false });
  assert.throws(() => checkHabitCount(db, 'update', { id: sixth, active: true }), /Replace one instead of adding/);
  assert.throws(() => checkHabitCount(db, 'replace', { id: sixth }), /Replace one instead of adding/);
  checkHabitCount(db, 'delete', { id: sixth });
});
