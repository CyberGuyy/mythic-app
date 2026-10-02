import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeZone } from '../day.js';
import { localTime, dayLabel, whenLabel, numberWord, plural, isoWeek, pounds, dashless } from './format.js';

const now = new Date('2026-09-15T10:00:00Z');

test('times and days read in the local timezone (London here), in the mockup shapes', () => {
  assert.equal(localTime('2026-09-15T05:40:00Z'), '06:40');
  assert.equal(localTime('2026-12-15T05:40:00Z'), '05:40');
  assert.equal(dayLabel('2026-09-15'), 'Tue, Sep 15');
  assert.equal(whenLabel('2026-09-15T05:40:00Z', now), 'Today 06:40');
  assert.equal(whenLabel('2026-09-14T13:27:00Z', now), 'Yesterday 14:27');
  assert.equal(whenLabel('2026-09-11T13:28:00Z', now), 'Fri, Sep 11 · 14:28');
});

test('localTime follows the configured timezone', () => {
  try {
    setTimeZone('America/New_York');
    assert.equal(localTime('2026-09-15T05:40:00Z'), '01:40');
    assert.equal(whenLabel('2026-09-15T05:40:00Z', now), 'Today 01:40');
    assert.equal(whenLabel('2026-09-15T03:40:00Z', now), 'Yesterday 23:40');
  } finally {
    setTimeZone('Europe/London');
  }
  assert.equal(localTime('2026-09-15T05:40:00Z'), '06:40');
});

test('small numbers are words, plurals are plain', () => {
  assert.equal(numberWord(1), 'one');
  assert.equal(numberWord(4), 'four');
  assert.equal(numberWord(13), '13');
  assert.equal(plural(1, 'find', 'finds'), '1 find');
  assert.equal(plural(2, 'find', 'finds'), '2 finds');
});

test('the ISO week starts on Monday and pounds print like the mockup', () => {
  assert.equal(isoWeek('2026-09-14'), 38);
  assert.equal(isoWeek('2026-09-20'), 38);
  assert.equal(isoWeek('2026-09-21'), 39);
  assert.equal(isoWeek('2027-01-01'), 53);
  assert.equal(pounds(2000), '\u00a32,000');
  assert.equal(pounds(1200.5), '\u00a31,200.50');
  assert.equal(pounds(0), '\u00a30');
});

test('dashless turns long dashes into short ones through strings, arrays and objects', () => {
  assert.equal(dashless('coverage gap — not evidence – of nothing'), 'coverage gap - not evidence - of nothing');
  assert.deepEqual(dashless({ headline: 'a — b', items: [{ note: 'c – d' }], finds: 2, none: null }), { headline: 'a - b', items: [{ note: 'c - d' }], finds: 2, none: null });
  assert.equal(dashless(undefined), undefined);
});
