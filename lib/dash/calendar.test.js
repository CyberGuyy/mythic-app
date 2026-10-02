import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { monthGrid, shiftMonth, calendarView, sortItems, loadCalendar } from './calendar.js';
import { ensureProjects, addProject, updateProject } from '../simple/projects.js';
import { addFeed, refreshFeed } from '../connectors/calendar.js';

const task = (id, fields) => ({ id, title: 'Task ' + id, status: 'ready', section: 'work', owner: 'you', created_at: '2026-09-01T09:00:00Z', ...fields });
const state = (tasks = []) => ({ tasks_by_id: Object.fromEntries(tasks.map(item => [item.id, item])) });
const ics = events => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n' + events.map(lines => 'BEGIN:VEVENT\r\n' + lines.join('\r\n') + '\r\nEND:VEVENT\r\n').join('') + 'END:VCALENDAR\r\n';
const fetcherFor = body => async () => ({ ok: true, status: 200, text: async () => body });

test('months shift across years', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-09', 0), '2026-09');
  assert.throws(() => shiftMonth('2026-13', 1), /YYYY-MM/);
});

test('a month grid starts on Monday and takes 35 or 42 cells', () => {
  const september = monthGrid('2026-09', '2026-09-23');
  assert.equal(september.name, 'September');
  assert.equal(september.cells.length, 35);
  assert.deepEqual(september.cells[0], { day: '2026-08-31', date: 31, in_month: false, past: true, today: false });
  assert.equal(september.cells[1].day, '2026-09-01');
  assert.equal(september.cells.find(cell => cell.today).day, '2026-09-23');
  assert.equal(september.cells.filter(cell => cell.in_month).length, 30);
  assert.equal(september.cells.at(-1).day, '2026-10-04');
  // August 2026 starts on a Saturday and needs six rows.
  const august = monthGrid('2026-08', '2026-09-23');
  assert.equal(august.cells.length, 42);
  assert.equal(august.cells[0].day, '2026-07-27');
  // February 2027 starts on a Monday.
  assert.equal(monthGrid('2027-02', '2026-09-23').cells[0].day, '2027-02-01');
  assert.equal(monthGrid('2027-02', '2026-09-23').cells.length, 35);
});

test('open tasks land on their local due day with project, domain and lateness', () => {
  const view = calendarView({
    today: '2026-09-23',
    projects: [{ id: 'p1', name: 'Side project', domain: 'work', deadline: null }],
    state: state([
      task('a', { due_at: '2026-09-22T09:00:00.000Z', project_id: 'p1' }),
      task('b', { due_at: '2026-09-24T22:30:00.000Z', due_time: '23:30', section: 'life' }),
      task('c', { due_at: '2026-09-25T08:00:00.000Z', status: 'done' }),
      task('d', { due_at: null }),
      task('e', { due_at: '2026-12-25T09:00:00.000Z' }),
    ]),
  });
  assert.deepEqual(view.days['2026-09-22'], [{ kind: 'due', id: 'a', title: 'Task a', time: null, project_name: 'Side project', domain: 'work', late: true }]);
  assert.equal(view.days['2026-09-24'][0].time, '23:30', 'a late evening task in summer time stays on its local day');
  assert.equal(view.days['2026-09-24'][0].domain, 'life');
  assert.equal(view.days['2026-09-24'][0].late, false);
  assert.equal(view.days['2026-09-25'], undefined, 'done tasks are left off');
  assert.equal(Object.values(view.days).flat().some(item => item.id === 'e'), false, 'outside the three months');
  assert.equal(view.counts['2026-09'].due, 2);
});

test('project deadlines and calendar events join the days', () => {
  const view = calendarView({
    today: '2026-09-23',
    projects: [{ id: 'p1', name: 'Garden shed', domain: 'home', deadline: '2026-10-02' }, { id: 'p2', name: 'No date', domain: 'home' }],
    state: state([task('a', { due_at: '2026-10-02T13:00:00.000Z', due_time: '14:00' })]),
    events: [
      { id: 'e1', title: 'Dentist', day: '2026-10-02', time: '11:00' },
      { id: 'e2', title: 'Book club', day: '2026-10-01', time: '19:30' },
      { id: 'e3', title: '', day: '2026-08-20', time: '' },
      { id: 'e4', title: 'No day', day: 'soon', time: '09:00' },
      { id: 'e5', title: 'Far away', day: '2027-03-01', time: '09:00' },
      null,
    ],
  });
  assert.deepEqual(view.days['2026-10-02'].map(item => [item.kind, item.title, item.time]), [
    ['deadline', 'Garden shed', null], ['event', 'Dentist', '11:00'], ['due', 'Task a', '14:00'],
  ]);
  assert.equal(view.days['2026-10-02'][0].domain, 'home');
  assert.deepEqual(view.days['2026-10-01'].map(item => [item.kind, item.title, item.time]), [['event', 'Book club', '19:30']]);
  assert.deepEqual(view.days['2026-08-20'].map(item => [item.title, item.time]), [['Event', null]], 'an untitled, untimed event still shows');
  assert.equal(Object.values(view.days).flat().some(item => item.id === 'e4' || item.id === 'e5'), false);
  assert.deepEqual(view.counts['2026-10'], { due: 1, deadline: 1, event: 2, days: 2 });
  assert.deepEqual(view.counts['2026-08'], { due: 0, deadline: 0, event: 1, days: 1 });
});

test('three months come back, the middle one chosen by the month option', () => {
  const view = calendarView({ state: state(), today: '2026-09-23' });
  assert.equal(view.month, '2026-09');
  assert.deepEqual(view.months.map(grid => grid.month), ['2026-08', '2026-09', '2026-10']);
  const moved = calendarView({ state: state(), today: '2026-09-23', month: '2027-01' });
  assert.deepEqual(moved.months.map(grid => grid.month), ['2026-12', '2027-01', '2027-02']);
  assert.equal(calendarView({ state: state(), today: '2026-09-23', month: 'soon' }).month, '2026-09');
  assert.deepEqual(JSON.parse(JSON.stringify(view)), view);
});

test('items sort deadline first, then by time with untimed last', () => {
  const sorted = sortItems([
    { kind: 'due', title: 'b', time: null }, { kind: 'due', title: 'a', time: '15:00' },
    { kind: 'event', title: 'c', time: '09:00' }, { kind: 'deadline', title: 'd', time: null },
  ]);
  assert.deepEqual(sorted.map(item => item.title), ['d', 'c', 'a', 'b']);
});

test('the loader reads projects and connected calendars from SQLite and refuses a missing planning state', async () => {
  const db = new Database(':memory:');
  ensureProjects(db);
  const id = addProject(db, { name: 'Garden shed', domain: 'home', now: new Date('2026-09-01T09:00:00Z') });
  updateProject(db, id, { deadline: '2026-09-28' });
  const feed = addFeed(db, { name: 'Home', url: 'webcal://calendar.example.com/secret.ics' });
  const body = ics([
    ['UID:a', 'SUMMARY:Dentist', 'DTSTART:20260928T090000Z', 'DTEND:20260928T093000Z'],
    // 08:00 in Tokyo on 2 November is 23:00 in London on 1 November.
    ['UID:b', 'SUMMARY:Tokyo call', 'DTSTART;TZID=Asia/Tokyo:20261102T080000', 'DURATION:PT1H'],
    ['UID:c', 'SUMMARY:Dropped', 'STATUS:CANCELLED', 'DTSTART:20260929T090000Z'],
  ]);
  assert.deepEqual(await refreshFeed(db, feed, { fetcher: fetcherFor(body), now: new Date('2026-09-23T08:00:00Z') }), { ok: true });
  const data = await loadCalendar({ db, state: state(), today: '2026-09-23', options: {} });
  assert.deepEqual(data.days['2026-09-28'].map(item => [item.kind, item.title, item.time]), [['deadline', 'Garden shed', null], ['event', 'Dentist', '10:00']]);
  assert.equal(data.days['2026-09-29'], undefined, 'a cancelled event is left out');
  assert.deepEqual(data.days['2026-11-01'].map(item => [item.title, item.time]), [['Tokyo call', '23:00']], 'a Tokyo morning is the London evening before');
  assert.equal(data.days['2026-11-02'], undefined);
  await assert.rejects(loadCalendar({ db, state: null, today: '2026-09-23' }), /Tasks are unavailable/);
});

test('local days hold across the clock change', () => {
  const view = calendarView({
    today: '2026-10-20',
    state: state([
      // 00:30 on 25 October in London is still summer time: 23:30 UTC on the 24th.
      task('a', { due_at: '2026-10-24T23:30:00.000Z', due_time: '00:30' }),
      // After the clocks go back London is on UTC, so 23:30 UTC stays on the 26th.
      task('b', { due_at: '2026-10-26T23:30:00.000Z', due_time: '23:30' }),
    ]),
  });
  assert.deepEqual(view.days['2026-10-25'].map(item => item.id), ['a']);
  assert.equal(view.days['2026-10-24'], undefined);
  assert.deepEqual(view.days['2026-10-26'].map(item => item.id), ['b']);
  // The past flag follows today for every cell, in the month or not.
  const october = view.months[1];
  assert.equal(october.cells[0].day, '2026-09-28');
  assert.equal(october.cells.filter(cell => cell.past).length, 22);
  assert.equal(october.cells.filter(cell => cell.today).map(cell => cell.day)[0], '2026-10-20');
});
