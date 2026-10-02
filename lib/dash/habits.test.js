import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { addHabit, setHabitCheck } from '../simple/habits.js';
import { habitsView } from './habits.js';
import { flowerView, setHabitIcon, ensureHabitIcons } from './flower.js';

const TODAY = '2026-09-23';
const fresh = () => { const db = new Database(':memory:'); ensureHabitIcons(db); return db; };

test('the list carries icon, streak and today, and the map comes from the planning state', () => {
  const db = fresh();
  const gym = addHabit(db, { name: 'Gym', time_of_day: 'morning', now: new Date('2026-09-01T09:00:00Z') });
  const read = addHabit(db, { name: 'Read', time_of_day: 'evening', now: new Date('2026-09-01T09:00:00Z') });
  for (const day of ['2026-09-21', '2026-09-22', TODAY]) setHabitCheck(db, gym, day, true);
  setHabitIcon(db, read, 'book');
  const state = { tasks_by_id: { t: { id: 't', status: 'done', project_id: 'p', completed_at: '2026-09-22T10:00:00Z' } } };
  const view = habitsView(db, state, TODAY);
  assert.deepEqual(view.habits.map(({ name, icon, streak, checked_today }) => ({ name, icon, streak, checked_today })), [
    { name: 'Gym', icon: 'dumbbell', streak: 3, checked_today: true },
    { name: 'Read', icon: 'book', streak: 0, checked_today: false },
  ]);
  assert.equal(view.habits[0].icon_picked, false);
  assert.deepEqual(view.habits.map(habit => habit.checked_yesterday), [true, false]);
  assert.deepEqual(view.habits.map(({ tracked, since, dormant }) => ({ tracked, since, dormant })), [{ tracked: true, since: '2026-09-21', dormant: false }, { tracked: false, since: null, dormant: false }]);
  assert.equal(view.habits[1].icon_picked, true);
  assert.equal(view.consistency.weeks.length, 4);
  assert.equal(view.consistency.best_run, 1);
  assert.equal(view.consistency_error, null);
  assert.deepEqual(JSON.parse(JSON.stringify(view)), view);
});

test('no planning state: the habits still show and the map says tasks are unavailable', () => {
  const db = fresh();
  addHabit(db, { name: 'Gym', time_of_day: 'morning', now: new Date('2026-09-01T09:00:00Z') });
  const view = habitsView(db, null, TODAY);
  assert.equal(view.habits.length, 1);
  assert.equal(view.consistency, null);
  assert.equal(view.consistency_error, 'Tasks are unavailable right now.');
});

test('a habit last ticked long ago stays tracked: its petal is a dead husk until the next tick', () => {
  const db = fresh();
  const walk = addHabit(db, { name: 'Walk', time_of_day: 'morning', now: new Date('2026-07-01T09:00:00Z') });
  setHabitCheck(db, walk, '2026-08-01', true);
  const [row] = habitsView(db, null, TODAY).habits;
  assert.deepEqual({ tracked: row.tracked, since: row.since, dormant: row.dormant }, { tracked: true, since: '2026-08-01', dormant: false });
  assert.equal(flowerView(db, TODAY).habits[0].dead, true);
});
