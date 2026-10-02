import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ensureSleep, upsertNight, sleepSummary, loadSleep } from './sleep.js';
import { importHealthSleep, parseHealthDate, parseSamples, samplesToNights, sleepKind, writeHealthNights } from './health-sleep.js';

const fresh = () => { const db = new Database(':memory:'); ensureSleep(db); return db; };
const now = new Date('2026-09-24T09:00:00Z');

// A Watch night of stages, an iPhone in-bed sample over it, and a nap.
const NIGHT = [
  '2026-09-23T23:05:00+01:00 | 2026-09-24T01:30:00+01:00 | Core | Apple Watch',
  '2026-09-24T01:30:00+01:00 | 2026-09-24T01:50:00+01:00 | Awake | Apple Watch',
  '2026-09-24T01:50:00+01:00 | 2026-09-24T03:10:00+01:00 | Deep | Apple Watch',
  '2026-09-24T03:10:00+01:00 | 2026-09-24T06:55:00+01:00 | REM | Apple Watch',
  '2026-09-23T22:40:00+01:00 | 2026-09-24T07:10:00+01:00 | In Bed | iPhone',
  '2026-09-22T23:30:00+01:00 | 2026-09-23T07:00:00+01:00 | Asleep | iPhone',
  '2026-09-23T14:00:00+01:00 | 2026-09-23T15:30:00+01:00 | Asleep (Core) | Apple Watch',
].join('\n');

test('dates in ISO 8601 and the en-GB styles Shortcuts prints', () => {
  assert.equal(parseHealthDate('2026-09-24T07:12:00+01:00'), Date.parse('2026-09-24T06:12:00Z'));
  assert.equal(parseHealthDate('2026-09-24T07:12:00+0100'), Date.parse('2026-09-24T06:12:00Z'));
  assert.equal(parseHealthDate('2026-09-24T07:12:00'), Date.parse('2026-09-24T06:12:00Z'), 'no offset is London time');
  assert.equal(parseHealthDate('2026-12-24T07:12:00'), Date.parse('2026-12-24T07:12:00Z'), 'GMT in winter');
  assert.equal(parseHealthDate('24 Sep 2026 at 07:12'), Date.parse('2026-09-24T06:12:00Z'));
  assert.equal(parseHealthDate('24/09/2026, 07:12'), Date.parse('2026-09-24T06:12:00Z'));
  assert.equal(parseHealthDate('24 Sept 2026 at 7:12 pm'), Date.parse('2026-09-24T18:12:00Z'));
  assert.equal(parseHealthDate('yesterday'), null);
  assert.deepEqual(['Core', 'Asleep (REM)', 'In Bed', 'Awake', '0', '2', '4', 'Steps'].map(sleepKind), ['asleep', 'asleep', 'bed', 'awake', 'bed', 'awake', 'asleep', null]);
});

test('samples become one night per waking day: first to last asleep minute, awake time left out, the longer session wins', () => {
  const samples = parseSamples(NIGHT);
  assert.equal(samples.length, 7);
  assert.deepEqual(samplesToNights(samples), [
    { day: '2026-09-23', bed_at: '23:30', woke_at: '07:00', asleep_minutes: 450 },
    { day: '2026-09-24', bed_at: '23:05', woke_at: '06:55', asleep_minutes: 450 },
  ]);
  // Only in-bed samples (an iPhone without a Watch): in bed stands in.
  assert.deepEqual(samplesToNights(parseSamples('2026-09-23T23:00:00+01:00 | 2026-09-24T07:00:00+01:00 | In Bed | iPhone')), [{ day: '2026-09-24', bed_at: '23:00', woke_at: '07:00', asleep_minutes: 480 }]);
  // JSON works too; nonsense rows are skipped.
  assert.equal(parseSamples(JSON.stringify([{ start: '2026-09-24T00:00:00Z', end: '2026-09-24T07:00:00Z', value: 'Asleep' }, { start: 'x', end: 'y', value: 'Asleep' }])).length, 1);
});

test('the import fills Health nights and never overwrites one typed by hand', () => {
  const db = fresh();
  upsertNight(db, { day: '2026-09-23', bed_at: '00:10', woke_at: '08:00', now });
  const nights = samplesToNights(parseSamples(NIGHT));
  assert.equal(writeHealthNights(db, nights, now), 1);
  assert.equal(writeHealthNights(db, nights, now), 0, 'unchanged nights are not rewritten');
  const summary = sleepSummary(db, { today: '2026-09-24' });
  assert.deepEqual(summary.nights.map(n => [n.day, n.bed_at, n.woke_at, n.minutes, n.source]), [
    ['2026-09-23', '00:10', '08:00', 470, 'manual'],
    ['2026-09-24', '23:05', '06:55', 450, 'apple_health'],
  ]);
  assert.equal(summary.last.in_bed_minutes, 470);
  // Editing a Health night by hand makes it manual.
  upsertNight(db, { day: '2026-09-24', bed_at: '23:00', woke_at: '07:00', now });
  writeHealthNights(db, nights, now);
  assert.equal(sleepSummary(db, { today: '2026-09-24' }).last.bed_at, '23:00');
});

test('the file is read when it changes, found in the first place that has it, and problems are reported', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mythic-health-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const missing = path.join(dir, 'nope.txt'), file = path.join(dir, 'sleep.txt');
  const db = fresh();
  assert.equal(importHealthSleep(db, { files: [missing], now }).found, false);
  fs.writeFileSync(file, NIGHT);
  const first = importHealthSleep(db, { files: [missing, file], now });
  assert.deepEqual([first.found, first.nights, first.last_night, first.error], [true, 2, '2026-09-24', null]);
  assert.equal(importHealthSleep(db, { files: [file], now }).imported_at, first.imported_at, 'an unchanged file is not read again');
  fs.writeFileSync(file, 'garbage\n');
  fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
  const broken = importHealthSleep(db, { files: [file], now });
  assert.match(broken.error, /no readable Sleep Analysis samples/);
  assert.equal(sleepSummary(db, { today: '2026-09-24' }).nights.length, 2, 'a bad file leaves the nights alone');
});

test('the widget loader imports and says whether Health is connected', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mythic-health-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'sleep.txt'); fs.writeFileSync(file, NIGHT);
  const previous = process.env.MYTHIC_HEALTH_SLEEP_FILE; process.env.MYTHIC_HEALTH_SLEEP_FILE = file;
  t.after(() => { if (previous === undefined) delete process.env.MYTHIC_HEALTH_SLEEP_FILE; else process.env.MYTHIC_HEALTH_SLEEP_FILE = previous; });
  const data = await loadSleep({ db: fresh(), today: '2026-09-24', now });
  assert.equal(data.health.found, true); assert.equal(data.last.source, 'apple_health'); assert.equal(data.last.minutes, 450);
});
