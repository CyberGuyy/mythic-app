import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './db.js';
import { completeSetup, checkSetup } from './onboarding.js';
import { readProfile } from './profile.js';
import { listProjects } from './simple/projects.js';
import { listHabits } from './simple/habits.js';
import { readTasks } from './tasks/store.js';
import { listFeeds } from './connectors/calendar.js';
import { setTimeZone } from './day.js';

const ICS = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n';

test('the whole setup is saved in one go and marks onboarding done', async () => {
  const db = memoryDb();
  const made = await completeSetup(db, {
    name: '  Sam ', timezone: 'America/New_York',
    projects: [{ name: 'Kitchen', domain: 'home', deadline: '2026-12-01' }, { name: '' }],
    habits: [{ name: 'Read 10 pages', time_of_day: 'evening', icon: 'book' }, { name: 'Stretch', icon: 'not-an-icon' }],
    tasks: [{ title: 'Order samples', project: 0 }, { title: 'home: water the plants' }],
    calendar_url: 'webcal://calendar.example.com/a.ics',
  }, { fetcher: async () => ({ ok: true, status: 200, text: async () => ICS }) });
  setTimeZone('Europe/London');
  assert.deepEqual([made.projects, made.habits, made.tasks, made.calendar.ok], [1, 2, 2, true]);
  const profile = readProfile(db);
  assert.deepEqual([profile.name, profile.timezone, !!profile.onboarded_at], ['Sam', 'America/New_York', true]);
  const [project] = listProjects(db);
  assert.deepEqual([project.name, project.domain, project.deadline], ['Kitchen', 'home', '2026-12-01']);
  assert.deepEqual(listHabits(db).map(habit => habit.name).sort(), ['Read 10 pages', 'Stretch']);
  const tasks = Object.values(readTasks(db).tasks_by_id);
  assert.equal(tasks.find(task => task.title === 'Order samples').project_id, project.id);
  assert.equal(tasks.find(task => task.title === 'water the plants').section, 'home');
  assert.equal(listFeeds(db)[0].host, 'calendar.example.com');
});

test('a bad timezone saves nothing', async () => {
  const db = memoryDb();
  await assert.rejects(completeSetup(db, { timezone: 'Mars/Olympus', tasks: [{ title: 'x' }] }), /timezone/);
  assert.equal(readProfile(db).onboarded_at, null);
  assert.equal(Object.keys(readTasks(db).tasks_by_id).length, 0);
});

test('limits are checked before anything is written', () => {
  assert.throws(() => checkSetup({ habits: Array.from({ length: 6 }, (_, i) => ({ name: 'h' + i })) }), /up to 5 habits/);
  assert.throws(() => checkSetup({ projects: Array.from({ length: 6 }, (_, i) => ({ name: 'p' + i })) }), /up to 5 projects/);
});

test('running it again adds, and never goes past five habits', async () => {
  const db = memoryDb();
  const five = Array.from({ length: 5 }, (_, i) => ({ name: 'Habit ' + i }));
  await completeSetup(db, { timezone: 'UTC', habits: five, projects: [{ name: 'Kitchen' }] });
  const again = await completeSetup(db, { timezone: 'UTC', habits: [{ name: 'One more' }], projects: [{ name: 'kitchen' }] });
  setTimeZone('Europe/London');
  assert.equal(again.habits, 0);
  assert.equal(listHabits(db).length, 5);
  assert.equal(listProjects(db).length, 1, 'the same project name is reused, not doubled');
});
