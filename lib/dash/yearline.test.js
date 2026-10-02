import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureProjects, addProject, updateProject, deleteProject } from '../simple/projects.js';
import { dayOfYear, daysInYear, yearProgress, yearFlags, placeFlags, labelSpans, yearlineData, loadYearline } from './yearline.js';

const now = new Date('2026-09-20T12:00:00Z');
const fresh = () => { const db = new Database(':memory:'); ensureProjects(db); return db; };

test('the year so far: day of year, days left, share gone and the month ticks', () => {
  assert.equal(dayOfYear('2026-01-01'), 1);
  assert.equal(dayOfYear('2026-09-20'), 263);
  assert.equal(daysInYear(2026), 365);
  assert.equal(daysInYear(2028), 366);
  const year = yearProgress('2026-09-20');
  assert.deepEqual({ year: year.year, days: year.days, doy: year.day_of_year, left: year.days_left, pct: year.pct_gone }, { year: 2026, days: 365, doy: 263, left: 102, pct: 72 });
  assert.equal(year.now_at, 72.05);
  assert.equal(year.months.length, 12);
  assert.deepEqual(year.months[0], { label: 'Jan', at: 0 });
  assert.deepEqual(year.months[9], { label: 'Oct', at: 74.79 });
  assert.equal(yearProgress('2028-12-31').days_left, 0);
  assert.throws(() => yearProgress('Sunday'), /YYYY-MM-DD/);
});

test('with no deadlines the only flag is Year end, and no forks are drawn', async () => {
  const data = await loadYearline({ db: fresh(), today: '2026-09-20' });
  assert.deepEqual(data.flags, [{ id: 'year-end', name: 'Year end', domain: null, day: '2026-12-31', on: '', at: 100, lane: 0, side: 'l' }]);
  assert.deepEqual(data.forks, []);
  assert.equal(data.fork_title, null);
  assert.doesNotThrow(() => JSON.stringify(data));
});

test('each project deadline this year is a flag in its domain, sorted, before Year end', () => {
  const db = fresh();
  const kitchen = addProject(db, { name: 'Kitchen delivery', domain: 'work', now });
  const portraits = addProject(db, { name: 'Portrait shoots', domain: 'work', now });
  const flat = addProject(db, { name: 'The flat', domain: 'home', now });
  const later = addProject(db, { name: 'Next year', domain: 'life', now });
  const gone = addProject(db, { name: 'Archived', domain: 'life', now });
  addProject(db, { name: 'No deadline', domain: 'life', now });
  updateProject(db, portraits, { deadline: '2026-10-18', now });
  updateProject(db, kitchen, { deadline: '2026-10-02', now });
  updateProject(db, flat, { deadline: '2026-03-01', now });
  updateProject(db, later, { deadline: '2027-01-15', now });
  updateProject(db, gone, { deadline: '2026-11-01', now });
  deleteProject(db, gone, now);
  const { flags } = yearlineData(db, { today: '2026-09-20' });
  assert.deepEqual(flags.map(flag => [flag.name, flag.domain, flag.on]), [
    ['The flat', 'home', '1 Mar'], ['Kitchen delivery', 'work', '2 Oct'], ['Portrait shoots', 'work', '18 Oct'], ['Year end', null, ''],
  ]);
  assert.equal(flags[1].at, 75.34);
  // Kitchen left of its diamond, Portraits right. Measured the way the
  // project line measures text (a little wide), Portraits' label runs into
  // where Year end's would sit, so Year end takes the row under the months.
  assert.deepEqual(flags.slice(1).map(flag => [flag.side, flag.lane]), [['l', 0], ['r', 0], ['l', 1]]);
});

test('labels that would collide swap sides, then drop under the month labels', () => {
  const flags = placeFlags([
    { name: 'Launch the community club site', on: '1 Jun', at: 41.4 },
    { name: 'Side project pitches', on: '4 Jun', at: 42.4 },
    { name: 'Third thing on the same week', on: '5 Jun', at: 42.6 },
  ]);
  assert.deepEqual(flags.map(flag => [flag.side, flag.lane]), [['l', 0], ['r', 0], ['l', 1]]);
  assert.equal(yearFlags([], 2026).at(-1).side, 'l');
  assert.equal(placeFlags([{ name: 'Early', on: '3 Jan', at: 1 }])[0].side, 'r');
});

// No two printed labels in the same lane may overlap (a quiet flag prints none).
const overlaps = flags => {
  const spans = labelSpans(flags);
  const hits = [];
  spans.forEach((a, i) => spans.slice(i + 1).forEach(b => { if (a.lane === b.lane && a.span[0] < b.span[1] && b.span[0] < a.span[1]) hits.push([a, b]); }));
  return hits;
};

test('three project deadlines in one week never print over each other', () => {
  const db = fresh();
  const days = { 'Community club delivery': '2026-10-02', 'Portrait shoots': '2026-10-05', 'Boiler service': '2026-10-06' };
  for (const [name, deadline] of Object.entries(days)) updateProject(db, addProject(db, { name, domain: 'work', now }), { deadline, now });
  const { flags } = yearlineData(db, { today: '2026-09-23' });
  assert.deepEqual(flags.map(flag => flag.name), ['Community club delivery', 'Portrait shoots', 'Boiler service', 'Year end']);
  assert.deepEqual(flags.map(flag => [flag.side, flag.lane, !!flag.quiet]), [['l', 0, false], ['r', 0, false], ['l', 1, false], ['l', 0, false]]);
  assert.deepEqual(overlaps(flags), []);
});

test('when all three rows are full a label goes quiet instead of overlapping', () => {
  const crowd = ['Kitchen delivery', 'Portrait shoots', 'Rate card', 'Boiler service', 'Lens return', 'Invoice run', 'Gym renewal', 'Car MOT']
    .map((name, k) => ({ id: 'p' + k, name, on: (2 + k) + ' Oct', at: 75.3 + k * .21 }));
  const flags = placeFlags(crowd);
  assert.deepEqual(overlaps(flags), []);
  assert.deepEqual(flags.map(flag => flag.quiet ? 'quiet' : flag.side + flag.lane), ['l0', 'l1', 'l2', 'quiet', 'r0', 'r1', 'r2', 'quiet']);
  // A quiet flag still sits on its day, so its diamond and tooltip stay.
  assert.equal(flags[3].quiet, true);
  assert.equal(flags[3].at, crowd[3].at);
  // Year end right after a late-December deadline drops a lane rather than colliding.
  const december = yearFlags([{ id: 'd', name: 'Christmas cards', domain: 'home', deadline: '2026-12-20' }], 2026);
  assert.deepEqual(overlaps(december), []);
  assert.deepEqual(december.map(flag => flag.side + flag.lane), ['l0', 'l1']);
});

test('a project with a deadline this year gets a flag on it', () => {
  const flags = yearFlags([
    { id: 'f', name: 'Novel', domain: 'work', deadline: '2026-11-30' },
    { id: 'j', name: 'Trip abroad', domain: 'life', deadline: '2026-12-01' },
    { id: 'p', name: 'Side shop', domain: 'work', deadline: '2026-10-15' },
  ], 2026);
  assert.deepEqual(flags.filter(f => f.id !== 'year-end').map(f => [f.id, f.day]), [['p', '2026-10-15'], ['f', '2026-11-30'], ['j', '2026-12-01']]);
});

// ---------- W2 and W8: the labels at the width the track is drawn, and clear of the fork ----------
import { WIDE_TRACK, PHONE_TRACK, FORK_PX, labelPx } from './yearline-layout.js';

// Every printed label box, and the fork's box in the top row, never overlap
// in a lane, and every label stays on the track.
const assertClear = (flags, { width, fork_at = null }, note) => {
  const spans = labelSpans(flags, { width });
  for (const { span } of spans) assert.ok(span[0] >= -1e-9 && span[1] <= 100 + 1e-9, `${note} a label runs off the track: ${span}`);
  const boxes = [...spans, ...(fork_at === null ? [] : [{ lane: 0, span: [fork_at + FORK_PX[0] / width * 100, fork_at + FORK_PX[1] / width * 100], fork: true }])];
  boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => {
    if (a.lane === b.lane) assert.ok(!(a.span[0] < b.span[1] && b.span[0] < a.span[1]), `${note} ${a.fork || b.fork ? 'a label crosses the fork' : 'two labels overlap'}: ${a.span} and ${b.span}`);
  }));
};

test('W2: at 390 px the walk\'s labels no longer print over each other; the later one drops its date, then takes the second row', () => {
  const projects = [
    { id: 'j', name: 'Trip abroad', domain: 'life', deadline: '2026-10-31' },
    { id: 'f', name: 'Novel', domain: 'work', deadline: '2026-12-15' },
  ];
  const phone = yearFlags(projects, 2026, { width: PHONE_TRACK });
  assertClear(phone, { width: PHONE_TRACK }, 'phone:');
  assert.deepEqual(phone.map(f => [f.id, f.side, f.lane, !!f.short, !!f.quiet]), [['j', 'l', 0, false, false], ['f', 'l', 1, false, false], ['year-end', 'l', 0, false, true]]);
  const wide = yearFlags(projects, 2026, { width: WIDE_TRACK });
  assertClear(wide, { width: WIDE_TRACK }, '1440:');
  assert.deepEqual(wide.map(f => [f.id, f.side, f.lane, !!f.quiet]), [['j', 'l', 0, false], ['f', 'l', 0, false], ['year-end', 'l', 1, false]]);
  // With a fork at today, it holds the top row: the trip takes the second row, the novel the third.
  const forked = yearFlags(projects, 2026, { width: PHONE_TRACK, fork_at: 74.8 });
  assertClear(forked, { width: PHONE_TRACK, fork_at: 74.8 }, 'phone with fork:');
  assert.deepEqual(forked.map(f => [f.id, f.lane, !!f.quiet]), [['j', 1, false], ['f', 2, false], ['year-end', 0, true]]);
  // Dropping the date comes before the second row.
  const pair = placeFlags([{ id: 'a', name: 'Visa', on: '1 Oct', at: 74.8 }, { id: 'b', name: 'Tax', on: '20 Oct', at: 80 }], { width: PHONE_TRACK });
  assert.deepEqual(pair.map(f => [f.side, f.lane, !!f.short]), [['l', 0, false], ['r', 0, true]]);
  assert.ok(labelPx(pair[1], true) < labelPx(pair[1]));
});

test('W2: two to four projects within two months never print over each other, at 390 and at 1440, with or without the fork', () => {
  const names = ['Trip abroad', 'Novel', 'Side shop retainer', 'Community club delivery'];
  let checked = 0, shortened = 0, lower = 0;
  for (const width of [PHONE_TRACK, WIDE_TRACK]) for (const start of ['2026-02-02', '2026-06-10', '2026-10-01', '2026-10-31']) for (const n of [2, 3, 4]) for (const spread of [2, 9, 20, 30]) {
    if ((n - 1) * spread > 60) continue;
    for (const fork_at of [null, 25, 74.8]) {
      const projects = names.slice(0, n).map((name, i) => ({ id: 'p' + i, name, domain: 'work', deadline: new Date(Date.parse(start + 'T12:00:00Z') + i * spread * 864e5).toISOString().slice(0, 10) }));
      const flags = yearFlags(projects, 2026, { width, fork_at });
      const note = `${width} px, ${n} from ${start} every ${spread} days, fork ${fork_at}:`;
      assertClear(flags, { width, fork_at }, note);
      assert.deepEqual(flags.map(f => f.id), [...projects.map(p => p.id), 'year-end'], note);
      shortened += flags.filter(f => f.short).length;
      lower += flags.filter(f => f.lane === 1).length;
      checked += 1;
    }
  }
  assert.ok(checked > 100);
  assert.ok(shortened > 0 && lower > 0, 'both the short label and the second row are used');
});

test('W8: with a fork held at today, a label that would sit across it moves; without one, it stays', () => {
  const projects = [{ id: 'j', name: 'Trip abroad', domain: 'life', deadline: '2026-10-31' }, { id: 'f', name: 'Novel', domain: 'work', deadline: '2026-12-15' }];
  const now_at = yearProgress('2026-09-30').now_at;
  const without = yearFlags(projects, 2026);
  const trip = labelSpans(without).find((_, i) => without.filter(f => !f.quiet)[i].id === 'j');
  assert.ok(trip.lane === 0 && trip.span[0] < now_at + FORK_PX[1] / WIDE_TRACK * 100, 'the walk\'s shot: Trip abroad starts left of where the fork ends');
  const withFork = yearFlags(projects, 2026, { fork_at: now_at });
  assertClear(withFork, { width: WIDE_TRACK, fork_at: now_at }, '1440 with the fork:');
  assert.notDeepEqual(withFork.find(f => f.id === 'j'), without.find(f => f.id === 'j'), 'Trip abroad moved off the fork');
});
