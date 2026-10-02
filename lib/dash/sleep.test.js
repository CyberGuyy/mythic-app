import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureSleep, upsertNight, listNights, sleepSummary, nightMinutes, bedMinutes, readWakeTarget, writeWakeTarget, loadSleep, morningReached, defaultWakeDay, DEFAULT_WAKE_TARGET } from './sleep.js';

const fresh = () => { const db = new Database(':memory:'); ensureSleep(db); return db; };
const now = new Date('2026-09-23T07:30:00Z');

test('a bedtime from noon on is the evening before, and durations follow', () => {
  assert.equal(bedMinutes('23:10'), -50);
  assert.equal(bedMinutes('00:30'), 30);
  assert.equal(bedMinutes('12:00'), -720);
  assert.equal(nightMinutes('23:10', '06:52'), 7 * 60 + 42);
  assert.equal(nightMinutes('01:15', '09:00'), 7 * 60 + 45);
  assert.equal(nightMinutes('22:00', '10:00'), 12 * 60);
});

test('a night is stored once per day and a second entry replaces it', () => {
  const db = fresh();
  assert.deepEqual(upsertNight(db, { day: '2026-09-23', bed_at: '23:10', woke_at: '06:52', now }), { day: '2026-09-23', bed_at: '23:10', woke_at: '06:52', minutes: 462 });
  upsertNight(db, { day: '2026-09-23', bed_at: '23:40', woke_at: '07:40', note: '  late film ', now });
  const rows = db.prepare('SELECT * FROM sleep_nights').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bed_at, '23:40');
  assert.equal(rows[0].note, 'late film');
  assert.equal(rows[0].created_at, now.toISOString());
});

test('bad days, times and impossible nights are refused', () => {
  const db = fresh();
  assert.throws(() => upsertNight(db, { day: '2026-02-30', bed_at: '23:00', woke_at: '07:00' }), /YYYY-MM-DD/);
  assert.throws(() => upsertNight(db, { day: '23/09/2026', bed_at: '23:00', woke_at: '07:00' }), /YYYY-MM-DD/);
  assert.throws(() => upsertNight(db, { day: '2026-09-23', bed_at: '25:00', woke_at: '07:00' }), /HH:MM/);
  assert.throws(() => upsertNight(db, { day: '2026-09-23', bed_at: '23:00', woke_at: '7:00' }), /HH:MM/);
  assert.throws(() => upsertNight(db, { day: '2026-09-23', bed_at: '06:30', woke_at: '07:00' }), /1 and 16 hours/);
  assert.throws(() => upsertNight(db, { day: '2026-09-23', bed_at: '03:00', woke_at: '02:00' }), /1 and 16 hours/);
  assert.throws(() => upsertNight(db, { day: '2026-09-23', bed_at: '13:00', woke_at: '08:00' }), /1 and 16 hours/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sleep_nights').get().n, 0);
});

test('the list covers the last twelve London days, oldest first, with the target', () => {
  const db = fresh();
  upsertNight(db, { day: '2026-09-10', bed_at: '23:00', woke_at: '07:00', now });
  upsertNight(db, { day: '2026-09-12', bed_at: '23:30', woke_at: '07:30', now });
  upsertNight(db, { day: '2026-09-22', bed_at: '00:30', woke_at: '08:30', now });
  upsertNight(db, { day: '2026-09-23', bed_at: '23:10', woke_at: '06:52', now });
  upsertNight(db, { day: '2026-09-24', bed_at: '23:10', woke_at: '06:52', now });
  const nights = listNights(db, { today: '2026-09-23' });
  assert.deepEqual(nights.map(night => night.day), ['2026-09-12', '2026-09-22', '2026-09-23']);
  assert.deepEqual(nights.map(night => night.on_time), [true, false, true]);
  assert.equal(listNights(db, { today: '2026-09-23', target: '09:00' })[1].on_time, true);
});

test('the summary gives the average, the count up by the target and the last night', () => {
  const db = fresh();
  const empty = sleepSummary(db, { today: '2026-09-23' });
  assert.deepEqual(empty.nights, []);
  assert.equal(empty.average_minutes, null);
  assert.equal(empty.last, null);
  assert.equal(empty.target, DEFAULT_WAKE_TARGET);
  assert.equal(empty.days.length, 12);
  assert.equal(empty.days[0], '2026-09-12');
  assert.equal(empty.days[11], '2026-09-23');

  upsertNight(db, { day: '2026-09-01', bed_at: '22:00', woke_at: '06:00', now });
  const old = sleepSummary(db, { today: '2026-09-23' });
  assert.equal(old.nights.length, 0);
  assert.equal(old.last.day, '2026-09-01', 'the last night logged shows even outside the window');

  upsertNight(db, { day: '2026-09-22', bed_at: '00:30', woke_at: '08:30', now });
  upsertNight(db, { day: '2026-09-23', bed_at: '23:00', woke_at: '06:01', now });
  const summary = sleepSummary(db, { today: '2026-09-23' });
  assert.equal(summary.average_minutes, Math.round((480 + 421) / 2));
  assert.equal(summary.on_time_count, 1);
  assert.equal(summary.last.day, '2026-09-23');
  assert.equal(summary.last.minutes, 421);
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), summary);
});

test('the wake target is a setting with a default, and a bad one is refused', async () => {
  const db = fresh();
  assert.equal(readWakeTarget(db), '08:00');
  writeWakeTarget(db, '07:30', now);
  assert.equal(readWakeTarget(db), '07:30');
  assert.throws(() => writeWakeTarget(db, '7.30', now), /HH:MM/);
  upsertNight(db, { day: '2026-09-23', bed_at: '23:00', woke_at: '07:45', now });
  const data = await loadSleep({ db, today: '2026-09-23' });
  assert.equal(data.target, '07:30');
  assert.equal(data.on_time_count, 0);
});

test('a night counts only once its London morning has come', () => {
  // 00:40 on 23 September in London (BST), 23:40 UTC the evening before.
  const lateNight = new Date('2026-09-22T23:40:00Z');
  assert.equal(morningReached('2026-09-22', '08:00', lateNight), true, 'yesterday morning is past');
  assert.equal(morningReached('2026-09-23', '07:00', lateNight), false, 'this morning has not come yet');
  assert.equal(morningReached('2026-09-23', '00:30', lateNight), true, 'a wake at 00:30 is already behind');
  assert.equal(morningReached('2026-09-24', '07:00', lateNight), false);
  // 07:15 London on the same day: a 07:00 wake is behind, 07:30 is not.
  const morning = new Date('2026-09-23T06:15:00Z');
  assert.equal(morningReached('2026-09-23', '07:00', morning), true);
  assert.equal(morningReached('2026-09-23', '07:30', morning), false);
  // In winter London is on UTC: 07:15 UTC is 07:15 there.
  assert.equal(morningReached('2026-12-01', '07:10', new Date('2026-12-01T07:15:00Z')), true);
  assert.equal(morningReached('2026-12-01', '07:20', new Date('2026-12-01T07:15:00Z')), false);
});

test('the add-night line starts on yesterday before 04:00 London, else today', async () => {
  // 03:30 London (BST) on 23 September is 02:30 UTC.
  assert.equal(defaultWakeDay('2026-09-23', new Date('2026-09-23T02:30:00Z')), '2026-09-22');
  assert.equal(defaultWakeDay('2026-09-23', new Date('2026-09-23T03:00:00Z')), '2026-09-23', '04:00 is today');
  assert.equal(defaultWakeDay('2026-09-23', new Date('2026-09-23T12:00:00Z')), '2026-09-23');
  const data = await loadSleep({ db: fresh(), today: '2026-09-23', now: new Date('2026-09-22T23:40:00Z') });
  assert.equal(data.log_day, '2026-09-22');
});
