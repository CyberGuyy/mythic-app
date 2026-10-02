import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from '../db.js';
import { setTimeZone } from '../day.js';
import { feedUrl, addFeed, listFeeds, refreshFeed, refreshStaleFeeds, removeFeed, calendarEvents, MAX_FEEDS } from './calendar.js';

const ICS = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Dentist\r\nDTSTART:20261005T090000Z\r\nDTEND:20261005T093000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
const answer = (body, status = 200) => async () => ({ ok: status < 400, status, text: async () => body });

test('webcal becomes https and only web addresses are taken', () => {
  assert.equal(feedUrl('webcal://p01-calendars.icloud.com/x.ics'), 'https://p01-calendars.icloud.com/x.ics');
  assert.throws(() => feedUrl('file:///etc/passwd'), /https/);
  assert.throws(() => feedUrl('not a url'), /iCal address/);
});

test('a feed is read, kept and expanded; the address is never listed', async () => {
  setTimeZone('Europe/London');
  const db = memoryDb();
  const id = addFeed(db, { name: 'Personal', url: 'https://calendar.example.com/secret-token/basic.ics' });
  assert.deepEqual(await refreshFeed(db, id, { fetcher: answer(ICS) }), { ok: true });
  const [feed] = listFeeds(db);
  assert.deepEqual([feed.name, feed.host, feed.ready, feed.error], ['Personal', 'calendar.example.com', true, null]);
  assert.equal(JSON.stringify(listFeeds(db)).includes('secret-token'), false);
  const events = calendarEvents(db, { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(events.map(event => [event.day, event.time, event.title, event.calendar]), [['2026-10-05', '10:00', 'Dentist', 'Personal']]);
});

test('a failed fetch keeps the last copy and records the error', async () => {
  const db = memoryDb();
  const id = addFeed(db, { url: 'https://calendar.example.com/a.ics' });
  await refreshFeed(db, id, { fetcher: answer(ICS) });
  const result = await refreshFeed(db, id, { fetcher: answer('nope', 404) });
  assert.equal(result.ok, false);
  assert.match(listFeeds(db)[0].error, /404/);
  assert.equal(calendarEvents(db, { from: '2026-10-01', to: '2026-10-31' }).length, 1);
  const html = await refreshFeed(db, id, { fetcher: answer('<html></html>') });
  assert.match(html.error, /did not return a calendar/);
});

test('only stale feeds are fetched, and feeds are capped', async () => {
  const db = memoryDb();
  addFeed(db, { url: 'https://calendar.example.com/a.ics' });
  let calls = 0;
  const counting = async () => { calls += 1; return { ok: true, status: 200, text: async () => ICS }; };
  await refreshStaleFeeds(db, { fetcher: counting });
  await refreshStaleFeeds(db, { fetcher: counting });
  assert.equal(calls, 1);
  for (let i = 1; i < MAX_FEEDS; i += 1) addFeed(db, { url: `https://calendar.example.com/${i}.ics` });
  assert.throws(() => addFeed(db, { url: 'https://calendar.example.com/x.ics' }), /up to/);
  removeFeed(db, listFeeds(db)[0].id);
  assert.equal(listFeeds(db).length, MAX_FEEDS - 1);
});
