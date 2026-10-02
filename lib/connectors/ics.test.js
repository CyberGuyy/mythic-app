import test from 'node:test';
import assert from 'node:assert/strict';
import { expandEvents, parseRule, durationMs, contentLines } from './ics.js';
import { setTimeZone } from '../day.js';

const feed = body => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n' + body + 'END:VCALENDAR\r\n';
const event = lines => 'BEGIN:VEVENT\r\n' + lines.join('\r\n') + '\r\nEND:VEVENT\r\n';

test('unfolds lines and keeps colons inside quoted parameters', () => {
  const lines = contentLines('SUMMARY:Long\r\n  title\r\nDTSTART;TZID="Europe/London":20261005T090000\r\n');
  assert.equal(lines[0].value, 'Long title');
  assert.equal(lines[1].params.TZID, 'Europe/London');
});

test('a timed event lands on the local day and wall time', () => {
  setTimeZone('Europe/London');
  const text = feed(event(['UID:a', 'SUMMARY:Standup', 'DTSTART:20261005T080000Z', 'DTEND:20261005T083000Z']));
  const [item] = expandEvents(text, { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual([item.day, item.time, item.minutes, item.title], ['2026-10-05', '09:00', 30, 'Standup']);
});

test('a TZID event is read in its own zone', () => {
  setTimeZone('Europe/London');
  const text = feed(event(['UID:b', 'SUMMARY:NY call', 'DTSTART;TZID=America/New_York:20261005T090000', 'DURATION:PT1H']));
  const [item] = expandEvents(text, { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual([item.day, item.time, item.minutes], ['2026-10-05', '14:00', 60]);
});

test('all-day events cover each day up to the end date', () => {
  setTimeZone('Europe/London');
  const text = feed(event(['UID:c', 'SUMMARY:Trip', 'DTSTART;VALUE=DATE:20261010', 'DTEND;VALUE=DATE:20261013']));
  assert.deepEqual(expandEvents(text, { from: '2026-10-01', to: '2026-10-31' }).map(item => [item.day, item.time]), [['2026-10-10', null], ['2026-10-11', null], ['2026-10-12', null]]);
});

test('weekly rules with BYDAY, COUNT, EXDATE and a moved occurrence', () => {
  setTimeZone('Europe/London');
  const text = feed(
    event(['UID:d', 'SUMMARY:Gym', 'DTSTART;TZID=Europe/London:20261005T070000', 'DTEND;TZID=Europe/London:20261005T080000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6', 'EXDATE;TZID=Europe/London:20261007T070000'])
    + event(['UID:d', 'SUMMARY:Gym (late)', 'RECURRENCE-ID;TZID=Europe/London:20261012T070000', 'DTSTART;TZID=Europe/London:20261012T190000', 'DTEND;TZID=Europe/London:20261012T200000']));
  const days = expandEvents(text, { from: '2026-10-01', to: '2026-11-30' }).map(item => item.day + ' ' + item.time);
  // 5, 7 (excluded), 12 (moved to the evening), 14, 19, 21: six counted, five shown
  assert.deepEqual(days, ['2026-10-05 07:00', '2026-10-12 19:00', '2026-10-14 07:00', '2026-10-19 07:00', '2026-10-21 07:00']);
});

test('a weekly event keeps its wall time across the clock change', () => {
  setTimeZone('Europe/London');
  const text = feed(event(['UID:e', 'SUMMARY:Review', 'DTSTART;TZID=Europe/London:20261023T090000', 'RRULE:FREQ=WEEKLY;UNTIL=20261106T235959Z']));
  assert.deepEqual(expandEvents(text, { from: '2026-10-01', to: '2026-11-30' }).map(item => item.time), ['09:00', '09:00', '09:00']);
});

test('monthly by position and yearly rules', () => {
  try {
    setTimeZone('UTC');
    const monthly = feed(event(['UID:f', 'SUMMARY:Last Friday', 'DTSTART:20260130T100000Z', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR']));
    assert.deepEqual(expandEvents(monthly, { from: '2026-10-01', to: '2026-12-31' }).map(item => item.day), ['2026-10-30', '2026-11-27', '2026-12-25']);
    const yearly = feed(event(['UID:g', 'SUMMARY:Birthday', 'DTSTART;VALUE=DATE:19900214', 'RRULE:FREQ=YEARLY']));
    assert.deepEqual(expandEvents(yearly, { from: '2027-01-01', to: '2027-12-31' }).map(item => item.day), ['2027-02-14']);
  } finally {
    setTimeZone('Europe/London');
  }
});

test('cancelled events are left out', () => {
  const text = feed(event(['UID:h', 'SUMMARY:Off', 'STATUS:CANCELLED', 'DTSTART:20261005T080000Z']));
  assert.equal(expandEvents(text, { from: '2026-10-01', to: '2026-10-31' }).length, 0);
});

test('rules and durations parse', () => {
  assert.equal(parseRule('FREQ=HOURLY'), null);
  assert.equal(parseRule('FREQ=DAILY;INTERVAL=2').interval, 2);
  assert.equal(durationMs('PT1H30M'), 90 * 60000);
  assert.equal(durationMs('P1W'), 7 * 86400000);
});
