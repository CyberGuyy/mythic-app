import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { register } from 'node:module';

// The round-trip test at the bottom posts every mapper's body to its real
// route, so the environment points at a throwaway data folder and database.
const ROOT = mkdtempSync(join(tmpdir(), 'dash-composer-'));
process.env.MYTHIC_DATA_DIR = ROOT;
process.env.MYTHIC_DB_PATH = join(ROOT, 'test.db');
// The routes import through the '@/' alias (jsconfig.json); Next resolves it
// when it bundles, and this hook resolves it for node --test.
const APP = new URL('../../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(specifier, context, next) { return next(specifier.startsWith('@/') ? ${JSON.stringify(APP)} + specifier.slice(2) : specifier, context); }`));

const C = await import('./composer.js');

test('date chips read Today, Tomorrow, Yesterday, a short day, or No date', () => {
  const today = '2026-09-23'; // a Wednesday
  assert.equal(C.dateChipLabel(today, today), 'Today');
  assert.equal(C.dateChipLabel('2026-09-24', today), 'Tomorrow');
  assert.equal(C.dateChipLabel('2026-09-22', today), 'Yesterday');
  assert.equal(C.dateChipLabel('2026-09-26', today), 'Sat 26 Sep');
  assert.equal(C.dateChipLabel('2026-10-02', today), 'Fri 2 Oct');
  assert.equal(C.dateChipLabel('2027-01-04', today), 'Mon 4 Jan 2027');
  assert.equal(C.dateChipLabel(null, today), 'No date');
  assert.equal(C.dateChipLabel('2026-02-30', today), 'No date');
});

test('the quick days are today, tomorrow and the next Monday', () => {
  assert.deepEqual(C.quickDays('2026-09-23'), [['Today', '2026-09-23'], ['Tomorrow', '2026-09-24'], ['Next Mon', '2026-09-28']]);
  assert.equal(C.nextMonday('2026-09-28'), '2026-10-05'); // on a Monday, the one after
  assert.equal(C.nextMonday('2026-09-27'), '2026-09-28'); // on a Sunday, tomorrow
  assert.equal(C.nextMonday('2026-12-30'), '2027-01-04');
});

test('the mini calendar is whole Monday-first weeks', () => {
  const cells = C.monthCells('2026-09');
  assert.equal(cells.length % 7, 0);
  assert.equal(cells[0].day, '2026-08-31'); // 1 September 2026 is a Tuesday
  assert.equal(cells[0].in_month, false);
  assert.deepEqual(cells[1], { day: '2026-09-01', date: 1, in_month: true });
  assert.equal(cells.at(-1).day, '2026-10-04');
  assert.equal(cells.filter(cell => cell.in_month).length, 30);
  assert.equal(C.monthCells('2026-02')[0].day, '2026-01-26');
  assert.equal(C.addMonths('2026-12', 1), '2027-01');
  assert.equal(C.addMonths('2026-01', -1), '2025-12');
  assert.equal(C.monthTitle('2026-09', '2026-09-23'), 'September');
  assert.equal(C.monthTitle('2027-01', '2026-09-23'), 'January 2027');
});

test('typed times read with or without a separator', () => {
  assert.equal(C.parseTime('930'), '09:30');
  assert.equal(C.parseTime('9:30'), '09:30');
  assert.equal(C.parseTime('9.30'), '09:30');
  assert.equal(C.parseTime('0930'), '09:30');
  assert.equal(C.parseTime('1530'), '15:30');
  assert.equal(C.parseTime('9'), '09:00');
  assert.equal(C.parseTime('15'), '15:00');
  assert.equal(C.parseTime(' 23:05 '), '23:05');
  assert.equal(C.parseTime('9am'), '09:00');
  assert.equal(C.parseTime('9:30 pm'), '21:30');
  assert.equal(C.parseTime('12am'), '00:00');
  assert.equal(C.parseTime('12pm'), '12:00');
  assert.equal(C.parseTime(''), '');
  assert.equal(C.parseTime('   '), '');
  for (const bad of ['25', '2400', '9:75', '13pm', 'nine', '12345', '9:3']) assert.equal(C.parseTime(bad), null, bad);
});

test('the time picker columns and the chip label', () => {
  assert.equal(C.HOURS.length, 24);
  assert.deepEqual(C.MINUTES.slice(0, 3), ['00', '05', '10']);
  assert.equal(C.MINUTES.at(-1), '55');
  assert.equal(C.withHour('09:30', '14'), '14:30');
  assert.equal(C.withHour(null, '7'), '07:00');
  assert.equal(C.withMinute('09:30', '45'), '09:45');
  assert.equal(C.withMinute(null, '15'), '09:15');
  assert.equal(C.timeChipLabel('15:00'), '15:00');
  assert.equal(C.timeChipLabel(null), 'No time');
  assert.deepEqual(C.TIME_QUICK.map(([, time]) => time), ['09:00', '12:00', '14:00', '18:00']);
  assert.equal(C.nightLength('23:30', '07:15'), 465);
  assert.equal(C.nightLength('00:40', '08:00'), 440);
  assert.equal(C.nightLength('23:30', null), null);
});

test('duration chips and typed minutes', () => {
  assert.deepEqual(C.DURATION_CHIPS.map(C.durationChipLabel), ['15m', '30m', '45m', '1h', '1h30', '2h', '3h']);
  assert.equal(C.readMinutes(''), null);
  assert.equal(C.readMinutes('50'), 50);
  assert.ok(Number.isNaN(C.readMinutes('4')));
  assert.ok(Number.isNaN(C.readMinutes('1441')));
  assert.ok(Number.isNaN(C.readMinutes('2.5')));
});

test('the task mapper creates, and an edit sends every editor field', () => {
  const form = { ...C.taskStart(null, { title: '  Draft the rate card ', section: 'life', project_id: 'p1', due_day: '2026-09-26' }), due_time: '15:00', estimate_minutes: 60, remind: true };
  assert.deepEqual(C.taskBody(form), {
    action: 'create', title: 'Draft the rate card', section: 'life', project_id: 'p1', due_day: '2026-09-26', due_time: '15:00',
    estimate_minutes: 60, repeat: 'none', remind: true, is_priority: false, detail: '',
  });
  const row = { id: 't1', title: 'Old', section: 'home', project_id: null, due_day: '2026-09-24', due_time: null, due_at: '2026-09-24T16:00:00.000Z', repeat: 'weekly', remind: false, is_priority: true, detail: 'x', estimate_minutes: null };
  const start = C.taskStart(row);
  assert.equal(start.section, 'home');
  assert.equal(start.repeat, 'weekly');
  assert.equal(start.is_priority, true);
  // day and time untouched: the exact due_at goes back
  const same = C.taskBody({ ...start, title: 'New title' }, row);
  assert.equal(same.action, 'update');
  assert.equal(same.id, 't1');
  assert.equal(same.due_at, row.due_at);
  assert.equal(same.due_day, undefined);
  assert.equal(same.repeat, 'weekly');
  assert.equal(same.detail, 'x');
  // a moved day goes as a day
  const moved = C.taskBody({ ...start, due_day: '2026-09-30' }, row);
  assert.equal(moved.due_day, '2026-09-30');
  assert.equal(moved.due_at, undefined);
  // cleared
  const cleared = C.taskBody({ ...start, due_day: null }, row);
  assert.equal(cleared.due_day, null);
  assert.deepEqual(C.taskDeleteBody('t1'), { action: 'delete', id: 't1' });
});

test('the note, project, habit and night mappers', () => {
  const note = { id: 'n1', title: 'Old', body: 'b', project_id: 'p1', stamp: '2026-09-20T10:00:00.000Z' };
  assert.deepEqual(C.noteBody({ title: ' Film ending ', body: 'cup, street', project_id: null }), { action: 'save', title: 'Film ending', body: 'cup, street', project_id: null });
  assert.deepEqual(C.noteBody(C.noteStart(note), note), { action: 'save', id: 'n1', updated_at: note.stamp, title: 'Old', body: 'b', project_id: 'p1' });
  assert.equal(C.noteBody(C.noteStart(note), note, null).updated_at, undefined);

  const project = { id: 'p1', name: 'Shed', domain: 'home', deadline: '2026-10-02', weekly_target: 6, weekly_unit: 'hours', note: 'n' };
  assert.deepEqual(C.projectStart(project), { name: 'Shed', domain: 'home', deadline: '2026-10-02', weekly_target: '6', weekly_unit: 'hours', note: 'n' });
  assert.deepEqual(C.projectBody(C.projectStart(null, { name: 'Fitness ', domain: 'life' })), { action: 'add', name: 'Fitness', domain: 'life', deadline: null, weekly_target: null, weekly_unit: 'tasks', note: '' });
  assert.deepEqual(C.projectBody({ ...C.projectStart(project), weekly_target: ' 8 ' }, project), { action: 'update', id: 'p1', name: 'Shed', domain: 'home', deadline: '2026-10-02', weekly_target: 8, weekly_unit: 'hours', note: 'n' });

  assert.deepEqual(C.habitBody({ ...C.habitStart({ title: ' Read ' }), time_of_day: 'evening' }), { action: 'add', name: 'Read', time_of_day: 'evening' });
  assert.deepEqual(C.habitIconBody('h1', 'book'), { action: 'icon', habit_id: 'h1', icon: 'book' });
  const gym = { id: 'h2', name: 'Gym', time_of_day: 'evening', icon: 'dumbbell', icon_picked: false };
  assert.deepEqual(C.habitStart({}, gym), { name: 'Gym', time_of_day: 'evening', icon: null }, 'an icon the flower chose is not a pick');
  assert.equal(C.habitStart({}, { ...gym, icon_picked: true }).icon, 'dumbbell');
  assert.deepEqual(C.habitBody({ name: ' Gym ', time_of_day: 'evening' }, gym), { action: 'update', id: 'h2', name: 'Gym', time_of_day: 'evening' });
  assert.deepEqual(C.habitBody({ name: 'Swim', time_of_day: 'morning' }, gym, true), { action: 'replace', id: 'h2', name: 'Swim', time_of_day: 'morning' });

  const nights = { '2026-09-22': { bed_at: '23:40', woke_at: '07:10', note: 'late film' } };
  assert.deepEqual(C.nightStart({ day: '2026-09-22', nights }), { day: '2026-09-22', bed_at: '23:40', woke_at: '07:10', note: 'late film' });
  assert.deepEqual(C.nightStart({ day: '2026-09-23', nights }), { day: '2026-09-23', bed_at: null, woke_at: null, note: '' });
  assert.deepEqual(C.nightBody({ day: '2026-09-22', bed_at: '23:40', woke_at: '07:10', note: '' }), { action: 'night', day: '2026-09-22', bed_at: '23:40', woke_at: '07:10', note: '' });

});

test('the checks speak in the routes\' words and route lines find their field', () => {
  assert.deepEqual(C.checkForm('task', C.taskStart(null)), { title: 'A task needs a title.' });
  assert.deepEqual(C.checkForm('event', C.taskStart(null, { title: 'Call' })), { due_day: 'Choose a day.', due_time: 'Choose a time.' });
  assert.deepEqual(C.checkForm('task', { ...C.taskStart(null, { title: 'x' }), estimate_minutes: NaN }), { estimate_minutes: 'An estimate is whole minutes from 5 to 1440.' });
  assert.deepEqual(C.checkForm('note', C.noteStart(null)), { title: 'Give the note a title.' });
  assert.deepEqual(C.checkForm('project', { ...C.projectStart(null, { name: 'X' }), weekly_target: '0' }), { weekly_target: 'The weekly target is a whole number from 1 to 999.' });
  assert.deepEqual(C.checkForm('habit', C.habitStart()), { name: 'Give the habit a name.' });
  assert.deepEqual(Object.keys(C.checkForm('night', C.nightStart())), ['day', 'bed_at', 'woke_at']);
  assert.equal(C.fieldOf('task', 'Choose a valid due time.'), 'due_time');
  assert.equal(C.fieldOf('event', 'An estimate is whole minutes from 5 to 1440.'), 'estimate_minutes');
  assert.equal(C.fieldOf('night', 'That morning has not happened yet.'), 'day');
  assert.equal(C.fieldOf('project', 'Count the target in tasks or hours.'), 'weekly_target');
  assert.equal(C.fieldOf('unknown-form', 'A task needs a title.'), null);
  assert.equal(C.fieldOf('note', 'This note changed somewhere else after you opened it. Save again to keep your version.'), null);
});

test('headings and the unsaved-changes guard', () => {
  assert.deepEqual(C.headingOf('task', false), { title: 'New task', icon: 'tasks', jp: 'タスク' });
  assert.equal(C.headingOf('task', true).title, 'Edit task');
  assert.equal(C.headingOf('night').title, 'Log a night');
  assert.deepEqual(C.headingOf('event', true), { title: 'Edit event', icon: 'calendar', jp: '予定' });
  assert.equal(C.headingOf('unknown-form', false).title, 'New task', 'an unknown form falls back to the task heading');
  const start = C.taskStart(null, { title: 'x' });
  assert.equal(C.changed(start, { ...start }), false);
  assert.equal(C.changed(start, { ...start, detail: '' }), false);
  assert.equal(C.changed(start, { ...start, due_time: '09:00' }), true);
  assert.equal(C.changed({ a: null }, { a: '' }), false);
  // a list is the same when it holds the same items in the same order
  assert.equal(C.changed({ list: [] }, { list: [] }), false);
  assert.equal(C.changed({ list: ['a', 'b'] }, { list: ['a', 'b'] }), false);
  assert.equal(C.changed({ list: ['a', 'b'] }, { list: ['b', 'a'] }), true);
});

// ---- round trips: every mapper's body through its real route ----

const post = async (path, body) => {
  const route = await import('../../app' + path + '/route.js');
  const response = await route.POST(new Request('http://127.0.0.1:3188' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'http://127.0.0.1:3188', host: '127.0.0.1:3188' }, body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() };
};

test('every form posts a body its route accepts', async t => {
  const { getDb } = await import('../db.js');
  const { readTasks } = await import('../tasks/store.js');
  const { localToday } = await import('../day.js');
  const today = localToday();
  const yesterday = C.addDays(today, -1);
  t.after(() => { getDb().close(); rmSync(ROOT, { recursive: true, force: true }); });
  const tasks = () => readTasks(getDb());

  const project = await post(C.ROUTES.project, C.projectBody({ ...C.projectStart(null, { name: 'Garden shed', domain: 'home' }), deadline: C.addDays(today, 9), weekly_target: '5' }));
  assert.equal(project.status, 200, JSON.stringify(project.body));
  const projectId = project.body.id;
  const edited = await post(C.ROUTES.project, C.projectBody({ ...C.projectStart({ id: projectId, name: 'Garden shed', domain: 'home', weekly_target: 5, weekly_unit: 'tasks' }), weekly_target: '', note: 'paint' }, { id: projectId }));
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  const { listProjects } = await import('../simple/projects.js');
  const row = listProjects(getDb()).find(item => item.id === projectId);
  assert.equal(row.weekly_target, null);
  assert.equal(row.note, 'paint');

  const task = await post(C.ROUTES.task, C.taskBody({ ...C.taskStart(null, { title: 'Buy the wood', project_id: projectId }), due_day: C.addDays(today, 3), due_time: '15:00', estimate_minutes: 90, repeat: 'weekly' }));
  assert.equal(task.status, 200, JSON.stringify(task.body));
  const saved = tasks().tasks_by_id[task.body.id];
  assert.equal(saved.estimate_minutes, 90);
  assert.equal(saved.due_time, '15:00');
  assert.equal(saved.project_id, projectId);
  const { tasksWidget } = await import('./tasks.js');
  const shaped = tasksWidget(tasks(), getDb(), { today }).groups.todo.find(item => item.id === task.body.id);
  assert.equal(shaped.due_day, C.addDays(today, 3));
  assert.equal(shaped.repeat, 'weekly');
  const update = await post(C.ROUTES.task, C.taskBody({ ...C.taskStart(shaped), title: 'Buy the wood and the paint' }, shaped));
  assert.equal(update.status, 200, JSON.stringify(update.body));
  const after = tasks().tasks_by_id[task.body.id];
  assert.equal(after.title, 'Buy the wood and the paint');
  assert.equal(after.due_at, saved.due_at);
  assert.equal(after.repeat, 'weekly');
  const refused = await post(C.ROUTES.task, { ...C.taskBody(C.taskStart(null, { title: 'x' })), due_time: '25:00' });
  assert.equal(refused.status, 400);
  assert.equal(C.fieldOf('task', refused.body.error), 'due_time');
  assert.equal((await post(C.ROUTES.task, C.taskDeleteBody(task.body.id))).status, 200);
  assert.equal(tasks().tasks_by_id[task.body.id], undefined, 'a deleted task leaves the list');

  const event = await post(C.ROUTES.event, C.taskBody({ ...C.taskStart(null, { title: 'Dentist' }), due_day: C.addDays(today, 2), due_time: '11:00' }));
  assert.equal(event.status, 200, JSON.stringify(event.body));
  assert.equal(tasks().tasks_by_id[event.body.id].due_time, '11:00');

  const note = await post(C.ROUTES.note, C.noteBody({ title: 'Ideas', body: 'one\ntwo', project_id: projectId }));
  assert.equal(note.status, 200, JSON.stringify(note.body));
  assert.equal((await post(C.ROUTES.note, C.noteDeleteBody(note.body.id))).status, 200);

  const habit = await post(C.ROUTES.habit, C.habitBody({ name: 'Read 20 pages', time_of_day: 'evening' }));
  assert.equal(habit.status, 200, JSON.stringify(habit.body));
  assert.equal((await post('/api/flower', C.habitIconBody(habit.body.id, 'book'))).status, 200);
  const habitEdit = await post(C.ROUTES.habit, C.habitBody({ name: 'Read 30 pages', time_of_day: 'evening' }, { id: habit.body.id }));
  assert.equal(habitEdit.status, 200, JSON.stringify(habitEdit.body));

  const night = await post(C.ROUTES.night, C.nightBody({ day: yesterday, bed_at: '23:30', woke_at: '07:15', note: 'late' }));
  assert.equal(night.status, 200, JSON.stringify(night.body));
  const short = await post(C.ROUTES.night, C.nightBody({ day: yesterday, bed_at: '06:50', woke_at: '07:15', note: '' }));
  assert.equal(C.fieldOf('night', short.body.error), 'woke_at');
});
