import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { todayView, loadToday } from './today.js';
import { estimateOf } from './estimate.js';
import { liveDay, formatMinutes, localMinutes, clockOf, untilNextMinute } from './today-live.js';
import { dueAtForDay } from '../simple/tasks-view.js';
import { ensureProjects, addProject } from '../simple/projects.js';
import { addFeed, refreshFeed } from '../connectors/calendar.js';
import { setTimeZone } from '../day.js';

const DAY = '2026-09-23';
const NOW = new Date('2026-09-23T12:12:00Z'); // 13:12 in London (BST)
const at = time => dueAtForDay(DAY, time);
let seq = 0;
const task = (title, fields = {}) => ({ id: 'task-' + (++seq), title, status: 'ready', section: 'work', created_at: '2026-09-20T09:00:00Z', ...fields });
const planning = tasks => ({ tasks_by_id: Object.fromEntries(tasks.map(item => [item.id, item])) });

test('minutes print the way the mockup does', () => {
  assert.equal(formatMinutes(45), '45m');
  assert.equal(formatMinutes(60), '1h');
  assert.equal(formatMinutes(160), '2h 40m');
  assert.equal(formatMinutes(65), '1h 05m');
  assert.equal(formatMinutes(0), '0m');
  assert.equal(clockOf(13 * 60 + 5), '13:05');
  assert.equal(localMinutes(NOW), 13 * 60 + 12);
  assert.equal(localMinutes(new Date('2026-12-01T09:30:00Z')), 9 * 60 + 30);
  try {
    setTimeZone('America/New_York');
    assert.equal(localMinutes(NOW), 8 * 60 + 12);
  } finally {
    setTimeZone('Europe/London');
  }
});

test('estimates come from the shared rule in estimate.js', () => {
  assert.doesNotMatch(readFileSync(new URL('./today.js', import.meta.url), 'utf8'), /function estimateOf/);
  const minutes = estimate_minutes => todayView(planning([task('Timed', { due_at: at('17:00'), due_time: '17:00', estimate_minutes })]), { now: NOW, today: DAY }).items[0].minutes;
  assert.equal(minutes(30), 30);
  for (const bad of [undefined, null, 0, -5, 2.5, 'soon', 5000]) assert.equal(minutes(bad), null);
  assert.equal(minutes(30), estimateOf({ estimate_minutes: 30 }));
});

test('the clock ticks on the turn of each minute', () => {
  const turn = Date.parse('2026-09-23T12:13:00Z');
  assert.equal(untilNextMinute(turn - 15000), 15020);
  assert.equal(untilNextMinute(turn), 60020);
  assert.equal(untilNextMinute(turn + 59999), 21);
  // A 15-second interval is gone from the component; one timer per minute is left.
  const source = readFileSync(new URL('../../components/dash/widgets/Today.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /setInterval/);
  assert.match(source, /untilNextMinute/);
});

test('the local day decides what is today, not the UTC date', () => {
  const tasks = [
    // 23:30 UTC on the 22nd is 00:30 on the 23rd in BST: today.
    task('Just after midnight', { due_at: '2026-09-22T23:30:00Z', due_time: '00:30' }),
    // 23:30 UTC on the 23rd is 00:30 on the 24th in BST: tomorrow.
    task('Tomorrow locally', { due_at: '2026-09-23T23:30:00Z', due_time: '00:30' }),
  ];
  // Calendar events arrive already on the local day and wall time (lib/connectors/calendar.js).
  const events = [
    { id: 'late', title: 'Late call', day: '2026-09-24', time: '01:00', minutes: 30 },
    { id: 'early', title: 'Night call', day: DAY, time: '00:30', minutes: 30 },
  ];
  const view = todayView(planning(tasks), { now: NOW, today: DAY, events });
  assert.deepEqual(view.items.map(item => [item.time, item.title]), [
    ['00:30', 'Just after midnight'],
    ['00:30', 'Night call'],
  ]);
  // In winter London is on UTC: 23:30 UTC is still the same day.
  const winter = todayView(planning([task('Winter late', { due_at: '2026-12-01T23:30:00Z', due_time: '23:30' })]), { now: new Date('2026-12-01T12:00:00Z'), today: '2026-12-01' });
  assert.deepEqual(winter.items.map(item => item.time), ['23:30']);
});

test('past rows: done items and ended events are struck, a missed task only dims', () => {
  const day = liveDay({ items: [
    { kind: 'task', start: 540, minutes: 30, time: '09:00', done: false },
    { kind: 'task', start: 600, minutes: 15, time: '10:00', done: true },
    { kind: 'event', start: 660, minutes: 45, time: '11:00', done: false },
    { kind: 'reminder', start: 700, minutes: null, time: '11:40', done: false },
    { kind: 'event', start: 780, minutes: 60, time: '13:00', done: false },
    { kind: 'task', start: 900, minutes: 30, time: '15:00', done: true },
  ] }, 792);
  assert.deepEqual(day.items.map(item => [item.time, item.past, item.struck]), [
    ['09:00', true, false],
    ['10:00', true, true],
    ['11:00', true, true],
    ['11:40', true, false],
    ['13:00', false, false], // on now
    ['15:00', true, true], // done early
  ]);
});

test('the day lists timed tasks, reminders and calendar events in time order', () => {
  const tasks = [
    task('Edit the short film', { due_at: at('14:00'), due_time: '14:00', estimate_minutes: 60, project_id: 'p1' }),
    task('Collect camera battery', { due_at: at('16:30'), due_time: '16:30', section: 'life', reminder: { id: 'r1', at: at('16:30'), channel: 'telegram' } }),
    task('Untimed today', { due_at: at('09:00') }),
    task('Tomorrow at ten', { due_at: dueAtForDay('2026-09-24', '10:00'), due_time: '10:00' }),
    task('Cancelled at nine', { due_at: at('09:00'), due_time: '09:00', status: 'cancelled' }),
    task('Stand-up done', { due_at: at('09:30'), due_time: '09:30', status: 'done', estimate_minutes: 15, completed_at: '2026-09-23T08:40:00Z' }),
  ];
  const events = [
    { id: 'e1', title: '  Client   call ', day: DAY, time: '11:00', minutes: 45 },
    { id: 'e2', title: 'All day', day: DAY, time: null },
    { id: 'e3', title: 'Next week', day: '2026-09-30', time: '15:00', minutes: 60 },
  ];
  const view = todayView(planning(tasks), { now: NOW, today: DAY, events, projects: [{ id: 'p1', name: 'Side project', domain: 'life' }] });
  assert.deepEqual(view.items.map(item => [item.time, item.title, item.kind, item.minutes, item.past]), [
    ['09:30', 'Stand-up done', 'task', 15, true],
    ['11:00', 'Client call', 'event', 45, true],
    ['14:00', 'Edit the short film', 'task', 60, false],
    ['16:30', 'Collect camera battery', 'reminder', null, false],
  ]);
  assert.equal(view.items[1].struck, true, 'an event that has ended is struck');
  const film = view.items[2];
  assert.equal(film.project_name, 'Side project');
  assert.equal(film.domain, 'life');
  assert.equal(view.items[3].domain, 'life');
  assert.equal(view.planned_minutes, 120);
  assert.equal(view.past_minutes, 60);
  assert.equal(view.progress, 50);
  assert.equal(view.now, '13:12');
  assert.equal(view.now_index, 2);
  assert.equal(view.free.until, '14:00');
  assert.equal(view.free.minutes, 48);
  assert.deepEqual(JSON.parse(JSON.stringify(view)), view);
});

test('the free block suggests the highest-priority task that fits the gap', () => {
  const tasks = [
    task('Edit film', { due_at: at('14:00'), due_time: '14:00' }),
    task('Later, fits', { due_at: dueAtForDay('2026-09-28', '09:00'), estimate_minutes: 20 }),
    task('Overdue, too long', { due_at: dueAtForDay('2026-09-20', '09:00'), estimate_minutes: 90 }),
    task('Overdue, fits', { due_at: dueAtForDay('2026-09-21', '09:00'), estimate_minutes: 15 }),
    task('Done, fits', { status: 'done', estimate_minutes: 10 }),
  ];
  const view = todayView(planning(tasks), { now: NOW, today: DAY });
  assert.deepEqual(view.free, { until: '14:00', minutes: 48, fit: { title: 'Overdue, fits', minutes: 15 } });
  assert.ok(!view.candidates.some(item => item.title === 'Edit film' || item.title === 'Done, fits'));
});

test('with no estimate that fits, the first urgent task without one is offered', () => {
  const tasks = [
    task('Edit film', { due_at: at('14:00'), due_time: '14:00' }),
    task('Too long', { due_at: dueAtForDay('2026-09-20', '09:00'), estimate_minutes: 120 }),
    task('Due today, no estimate', { due_at: at('09:00') }),
    task('Undated, no estimate'),
  ];
  const view = todayView(planning(tasks), { now: NOW, today: DAY });
  assert.deepEqual(view.free.fit, { title: 'Due today, no estimate', minutes: null });
  const none = todayView(planning([tasks[0], tasks[3]]), { now: NOW, today: DAY });
  assert.equal(none.free.fit, null);
});

test('no free block while something is on, or with nothing next', () => {
  const on = liveDay({ items: [{ start: 780, minutes: 60, time: '13:00' }, { start: 900, minutes: 30, time: '15:00' }] }, 792);
  assert.equal(on.free, null);
  assert.equal(on.now_index, 1);
  assert.equal(on.items[0].past, false);
  const after = liveDay({ items: [{ start: 600, minutes: 30, time: '10:00' }] }, 792);
  assert.equal(after.free, null);
  assert.equal(after.now_index, 1);
  assert.equal(after.progress, 100);
  const tight = liveDay({ items: [{ start: 795, minutes: 30, time: '13:15' }] }, 792);
  assert.equal(tight.free, null);
});

test('the now line and the free block at the edges of the day', () => {
  const items = [
    { kind: 'task', start: 540, minutes: 30, time: '09:00' },
    { kind: 'event', start: 600, minutes: 60, time: '10:00' },
  ];
  // Before everything: the line on top and free time until the first item.
  const early = liveDay({ items, candidates: [{ title: 'Short', minutes: 20 }] }, 45);
  assert.equal(early.now_index, 0);
  assert.equal(early.now, '00:45');
  assert.deepEqual(early.free, { until: '09:00', minutes: 495, fit: { title: 'Short', minutes: 20 } });
  assert.equal(early.past_minutes, 0);
  // Everything past: the line at the bottom, no free block, all the plan gone.
  const late = liveDay({ items }, 23 * 60 + 59);
  assert.equal(late.now_index, 2);
  assert.equal(late.free, null);
  assert.ok(late.items.every(item => item.past));
  assert.equal(late.progress, 100);
  // Nothing left but a done item later on: nothing to be free until.
  const doneLater = liveDay({ items: [...items, { kind: 'task', start: 900, minutes: 30, time: '15:00', done: true }] }, 700);
  assert.equal(doneLater.free, null);
  assert.equal(doneLater.now_index, 2);
  // An exact end: the item is over and the gap starts now.
  const edge = liveDay({ items: [...items, { kind: 'task', start: 720, minutes: 15, time: '12:00' }] }, 660);
  assert.equal(edge.items[1].past, true);
  assert.deepEqual(edge.free, { until: '12:00', minutes: 60, fit: null });
});

test('overlapping items: no free time while any of them runs', () => {
  const items = [
    { kind: 'event', start: 780, minutes: 90, time: '13:00' },
    { kind: 'task', start: 810, minutes: 15, time: '13:30' },
    { kind: 'task', start: 900, minutes: 30, time: '15:00' },
  ];
  // 13:50: the short task is over, the long event still runs.
  const inside = liveDay({ items }, 830);
  assert.equal(inside.free, null);
  assert.deepEqual(inside.items.map(item => item.past), [false, true, false]);
  assert.equal(inside.now_index, 2);
  // 14:40: both over, free until 15:00.
  const after = liveDay({ items }, 880);
  assert.deepEqual(after.free, { until: '15:00', minutes: 20, fit: null });
  // Planned minutes add up each item, overlaps included.
  assert.equal(after.planned_minutes, 135);
  assert.equal(after.past_minutes, 105);
});

test('a waiting task is not offered for a gap', () => {
  const tasks = [
    task('Edit film', { due_at: at('14:00'), due_time: '14:00' }),
    task('Waiting on the plumber', { status: 'waiting', estimate_minutes: 10, is_priority: true }),
    task('Fits', { estimate_minutes: 30 }),
  ];
  const view = todayView(planning(tasks), { now: NOW, today: DAY });
  assert.equal(view.free.fit.title, 'Fits');
  assert.ok(!view.candidates.some(item => item.title === 'Waiting on the plumber'));
});

test('an empty day is an empty list with nothing planned', () => {
  const view = todayView(planning([task('Undated')]), { now: NOW, today: DAY });
  assert.deepEqual(view.items, []);
  assert.equal(view.planned_minutes, 0);
  assert.equal(view.progress, 0);
  assert.equal(view.free, null);
});

test('the loader needs the planning state and reads project names and today\'s events from SQLite', async () => {
  const db = new Database(':memory:');
  ensureProjects(db);
  const id = addProject(db, { name: 'Side project', domain: 'work' });
  const feed = addFeed(db, { name: 'Home', url: 'https://calendar.example.com/secret.ics' });
  const body = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'
    + 'BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Dentist\r\nDTSTART:20260923T150000Z\r\nDTEND:20260923T153000Z\r\nEND:VEVENT\r\n'
    + 'BEGIN:VEVENT\r\nUID:b\r\nSUMMARY:Tomorrow\r\nDTSTART:20260924T150000Z\r\nEND:VEVENT\r\n'
    + 'END:VCALENDAR\r\n';
  await refreshFeed(db, feed, { fetcher: async () => ({ ok: true, status: 200, text: async () => body }), now: NOW });
  await assert.rejects(loadToday({ db, state: null, now: NOW, today: DAY }), /Tasks are unavailable right now/);
  const data = await loadToday({ db, state: planning([task('Shoot', { due_at: at('17:00'), due_time: '17:00', project_id: id })]), now: NOW, today: DAY });
  assert.deepEqual(data.items.map(item => [item.time, item.title, item.kind, item.minutes]), [['16:00', 'Dentist', 'event', 30], ['17:00', 'Shoot', 'task', null]]);
  assert.equal(data.items[1].project_name, 'Side project');
  db.close();
});
