// Calendar feeds: the secret iCal address of a Google, iCloud, Outlook or
// Fastmail calendar, read only. Each feed's last copy is kept in SQLite, so
// the Dash reads events without waiting on the network; a feed older than
// REFRESH_MS is fetched again in the background when the Dash loads.
import { randomUUID } from 'node:crypto';
import { expandEvents } from './ics.js';
import { timeZone } from '../day.js';

export const REFRESH_MS = 15 * 60 * 1000;
export const MAX_FEEDS = 10;
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15000;

export function ensureCalendar(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS calendar_feeds (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, body TEXT,
    fetched_at TEXT, error TEXT, created_at TEXT NOT NULL)`);
}

/** A feed address as https: webcal:// is the same feed over https. */
export function feedUrl(value) {
  const raw = String(value || '').trim().replace(/^webcals?:\/\//i, 'https://');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Paste the calendar’s iCal address (it starts with https:// or webcal://).'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an https:// or webcal:// address.');
  if (raw.length > 2000) throw new Error('That address is too long.');
  return url.toString();
}

/** The feeds without their bodies, and with the address shortened: the
 *  address is a secret that gives read access to the calendar. */
export function listFeeds(db) {
  ensureCalendar(db);
  return db.prepare('SELECT id, name, url, fetched_at, error, created_at, body IS NOT NULL AS has_body FROM calendar_feeds ORDER BY created_at').all()
    .map(row => ({ id: row.id, name: row.name, host: new URL(row.url).host, fetched_at: row.fetched_at, error: row.error, ready: !!row.has_body }));
}

export function addFeed(db, { name, url }) {
  ensureCalendar(db);
  const count = db.prepare('SELECT COUNT(*) AS n FROM calendar_feeds').get().n;
  if (count >= MAX_FEEDS) throw new Error(`Connect up to ${MAX_FEEDS} calendars.`);
  const clean = feedUrl(url);
  const label = String(name || '').trim().slice(0, 60) || new URL(clean).host;
  const id = randomUUID();
  db.prepare('INSERT INTO calendar_feeds (id, name, url, created_at) VALUES (?, ?, ?, ?)').run(id, label, clean, new Date().toISOString());
  return id;
}

export function removeFeed(db, id) {
  ensureCalendar(db);
  if (!db.prepare('DELETE FROM calendar_feeds WHERE id = ?').run(id).changes) throw new Error('Calendar not found.');
}

async function download(url, fetcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(url, { signal: controller.signal, redirect: 'follow', headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1' } });
    if (!response.ok) throw new Error(`The calendar answered ${response.status}. Check the address is the secret iCal one.`);
    const text = await response.text();
    if (text.length > MAX_BYTES) throw new Error('That calendar is over 5 MB.');
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('That address did not return a calendar. Use the iCal (.ics) address.');
    return text;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('The calendar did not answer in time.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch one feed now and keep its copy, or its error. */
export async function refreshFeed(db, id, { fetcher = fetch, now = new Date() } = {}) {
  ensureCalendar(db);
  const feed = db.prepare('SELECT * FROM calendar_feeds WHERE id = ?').get(id);
  if (!feed) throw new Error('Calendar not found.');
  try {
    const body = await download(feed.url, fetcher);
    db.prepare('UPDATE calendar_feeds SET body = ?, fetched_at = ?, error = NULL WHERE id = ?').run(body, now.toISOString(), id);
    return { ok: true };
  } catch (error) {
    db.prepare('UPDATE calendar_feeds SET fetched_at = ?, error = ? WHERE id = ?').run(now.toISOString(), String(error?.message || error).slice(0, 300), id);
    return { ok: false, error: String(error?.message || error) };
  }
}

let running = null;
/** Fetch every feed older than REFRESH_MS, one run at a time. */
export function refreshStaleFeeds(db, { fetcher = fetch, now = new Date() } = {}) {
  if (running) return running;
  ensureCalendar(db);
  const cutoff = new Date(now.getTime() - REFRESH_MS).toISOString();
  const stale = db.prepare('SELECT id FROM calendar_feeds WHERE fetched_at IS NULL OR fetched_at < ?').all(cutoff).map(row => row.id);
  if (!stale.length) return Promise.resolve([]);
  running = Promise.all(stale.map(id => refreshFeed(db, id, { fetcher, now }).catch(error => ({ ok: false, error: error.message }))))
    .finally(() => { running = null; });
  return running;
}

// Parsing a feed is the slow part, so the expansion is kept per feed body and window.
const cache = new Map();
/** Events from every feed between two local days (YYYY-MM-DD, both included). */
export function calendarEvents(db, { from, to }) {
  ensureCalendar(db);
  const zone = timeZone();
  const out = [];
  for (const feed of db.prepare('SELECT id, name, body, fetched_at FROM calendar_feeds WHERE body IS NOT NULL').all()) {
    const key = [feed.id, feed.fetched_at, from, to, zone].join('|');
    if (!cache.has(key)) {
      if (cache.size >= 40) cache.delete(cache.keys().next().value);
      let events = [];
      try { events = expandEvents(feed.body, { from, to, fallback: zone, feedId: feed.id }); } catch { events = []; }
      cache.set(key, events);
    }
    out.push(...cache.get(key).map(event => ({ ...event, calendar: feed.name })));
  }
  return out;
}
