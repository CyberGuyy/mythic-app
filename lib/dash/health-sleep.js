// Sleep from Apple Health. The Mac has no Health data store, so an iPhone
// Shortcut ("Mythic sleep", steps on /dash/health) writes the last two days of
// Sleep Analysis samples to a text file in iCloud Drive, and this reads that
// file whenever the Sleep widget loads and it has changed. One line per sample:
//   start | end | value | source
// with ISO 8601 dates (other separators and the en-GB date styles Shortcuts
// prints are accepted too). A JSON array of { start, end, value, source } also
// works. Samples become nights keyed by the local day of waking, written to
// sleep_nights with source 'apple_health'. A night typed or edited by hand
// (source 'manual') is never overwritten.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureDashSettings, readSetting, writeSetting } from './settings.js';
import { ensureSleep, nightMinutes, MIN_MINUTES, MAX_MINUTES } from './sleep.js';
import { zoned } from '../day.js';

export const HEALTH_KEY = 'health_sleep_import';
const MAX_BYTES = 2_000_000;
const SESSION_GAP_MS = 3 * 3600000;

/** Where the Shortcut's Save File lands: the Shortcuts folder in iCloud Drive
 *  (Save File with Ask Where off), or a Mythic folder at the iCloud Drive
 *  root. MYTHIC_HEALTH_SLEEP_FILE names another file. */
export function healthFiles(env = process.env) {
  if (env.MYTHIC_HEALTH_SLEEP_FILE) return [path.resolve(/*turbopackIgnore: true*/ env.MYTHIC_HEALTH_SLEEP_FILE)];
  const docs = path.join(/*turbopackIgnore: true*/ os.homedir(), 'Library', 'Mobile Documents');
  return [
    path.join(/*turbopackIgnore: true*/ docs, 'iCloud~is~workflow~my~workflows', 'Documents', 'Mythic', 'sleep.txt'),
    path.join(/*turbopackIgnore: true*/ docs, 'com~apple~CloudDocs', 'Shortcuts', 'Mythic', 'sleep.txt'),
    path.join(/*turbopackIgnore: true*/ docs, 'com~apple~CloudDocs', 'Mythic', 'sleep.txt'),
  ];
}

const LOCAL = () => zoned('en-GB', { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function localParts(ms) {
  const parts = Object.fromEntries(LOCAL().formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  return { day: parts.year + '-' + parts.month + '-' + parts.day, time: parts.hour + ':' + parts.minute };
}
/** A local wall time as an instant (the offset is found by trying it). */
function fromLocal(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let offset = -14 * 3600000; offset <= 14 * 3600000; offset += 900000) {
    const at = guess + offset, p = localParts(at);
    if (p.day === `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` && p.time === `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`) return at;
  }
  return guess;
}
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** An instant in ms from what Shortcuts prints, or null. ISO 8601 carries its
 *  own offset; the en-GB styles ("24 Sep 2026 at 07:12", "24/09/2026, 07:12")
 *  are local wall times. */
export function parseHealthDate(value) {
  const text = String(value ?? '').trim().replace(/ | /g, ' ');
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*([zZ]|[+-]\d{2}:?\d{2})?$/);
  if (iso) {
    if (!iso[6]) return fromLocal(+iso[1], +iso[2], +iso[3], +iso[4], +iso[5]);
    const ms = Date.parse(text.replace(' ', 'T').replace(/\s+(?=[zZ+-]\d*)/, '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    return Number.isFinite(ms) ? ms : null;
  }
  let m = text.match(/^(\d{1,2}) ([A-Za-z]{3,4})[a-z]* (\d{4})(?:,| at)? (\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (m && MONTHS[m[2].toLowerCase()]) return fromLocal(+m[3], MONTHS[m[2].toLowerCase()], +m[1], hour24(+m[4], m[6]), +m[5]);
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),? (?:at )?(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (m) return fromLocal(+m[3], +m[2], +m[1], hour24(+m[4], m[6]), +m[5]);
  return null;
}
const hour24 = (h, ampm) => !ampm ? h : (h % 12) + (/pm/i.test(ampm) ? 12 : 0);

/** asleep, bed or awake. HealthKit's numbers: 0 in bed, 2 awake, the rest
 *  (1 unspecified, 3 core, 4 deep, 5 REM) asleep. */
export function sleepKind(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (/^\d$/.test(text)) return text === '0' ? 'bed' : text === '2' ? 'awake' : 'asleep';
  if (/awake/.test(text)) return 'awake';
  if (/in ?bed/.test(text)) return 'bed';
  if (/asleep|core|deep|rem|unspecified|sleep|light/.test(text)) return 'asleep';
  return null;
}

/** Samples from the file: { start, end, kind, source } with ms instants. */
export function parseSamples(text) {
  const trimmed = String(text ?? '').trim();
  let rows = [];
  if (trimmed.startsWith('[')) {
    try { rows = JSON.parse(trimmed).map(r => [r?.start ?? r?.startDate, r?.end ?? r?.endDate, r?.value, r?.source]); } catch { rows = []; }
  } else {
    rows = trimmed.split(/\r?\n/).map(line => line.split(/\s*\|\s*|\t|\s*;\s*/));
  }
  const samples = [];
  for (const [start, end, value, source] of rows) {
    const s = parseHealthDate(start), e = parseHealthDate(end), kind = sleepKind(value);
    if (s == null || e == null || !kind || e <= s || e - s > 20 * 3600000) continue;
    samples.push({ start: s, end: e, kind, source: String(source ?? '').trim().slice(0, 80) });
  }
  return samples.sort((a, b) => a.start - b.start);
}

function union(intervals) {
  const out = [];
  for (const { start, end } of [...intervals].sort((a, b) => a.start - b.start)) {
    const last = out.at(-1);
    if (last && start <= last.end) last.end = Math.max(last.end, end); else out.push({ start, end });
  }
  return out;
}

/** Nights from samples: asleep time grouped into sessions (a gap of three
 *  hours or more starts a new one); a night runs from its first asleep minute
 *  to its last. When a day has two sessions (a nap), the longer one counts.
 *  In-bed samples only stand in when a session has no asleep samples. */
export function samplesToNights(samples) {
  const asleep = samples.filter(s => s.kind === 'asleep');
  const base = asleep.length ? asleep : samples.filter(s => s.kind === 'bed');
  const blocks = union(base);
  const sessions = [];
  for (const block of blocks) {
    const last = sessions.at(-1);
    if (last && block.start - last.end < SESSION_GAP_MS) { last.end = block.end; last.blocks.push(block); }
    else sessions.push({ start: block.start, end: block.end, blocks: [block] });
  }
  const byDay = new Map();
  for (const session of sessions) {
    const asleepMinutes = Math.round(session.blocks.reduce((sum, b) => sum + (b.end - b.start), 0) / 60000);
    const bed = localParts(session.start), wake = localParts(session.end);
    let span;
    try { span = nightMinutes(bed.time, wake.time); } catch { continue; }
    // The widget reads bed and wake as clock times around one waking day.
    if (span < MIN_MINUTES || span > MAX_MINUTES || asleepMinutes < MIN_MINUTES) continue;
    if (Math.abs(span - Math.round((session.end - session.start) / 60000)) > 90) continue;
    const night = { day: wake.day, bed_at: bed.time, woke_at: wake.time, asleep_minutes: asleepMinutes };
    const prior = byDay.get(wake.day);
    if (!prior || prior.asleep_minutes < asleepMinutes) byDay.set(wake.day, night);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Write nights, never over a hand-logged one. Returns how many changed. */
export function writeHealthNights(db, nights, now = new Date()) {
  ensureSleep(db);
  const at = now.toISOString();
  const existing = db.prepare('SELECT source FROM sleep_nights WHERE day = ?');
  const put = db.prepare(`INSERT INTO sleep_nights (day, bed_at, woke_at, note, source, asleep_minutes, created_at, updated_at) VALUES (?, ?, ?, '', 'apple_health', ?, ?, ?)
    ON CONFLICT(day) DO UPDATE SET bed_at = excluded.bed_at, woke_at = excluded.woke_at, asleep_minutes = excluded.asleep_minutes, source = 'apple_health', updated_at = excluded.updated_at
    WHERE sleep_nights.source = 'apple_health' AND (sleep_nights.bed_at != excluded.bed_at OR sleep_nights.woke_at != excluded.woke_at OR IFNULL(sleep_nights.asleep_minutes, -1) != excluded.asleep_minutes)`);
  let changed = 0;
  db.transaction(() => {
    for (const night of nights) {
      const row = existing.get(night.day);
      if (row && row.source !== 'apple_health') continue;
      changed += put.run(night.day, night.bed_at, night.woke_at, night.asleep_minutes, at, at).changes;
    }
  })();
  return changed;
}

/** Read the Shortcut's file when it changed since the last import. Never
 *  throws: problems land in the returned status, which the widget and
 *  /dash/health show. */
export function importHealthSleep(db, { files = healthFiles(), now = new Date() } = {}) {
  ensureDashSettings(db);
  const previous = readSetting(db, HEALTH_KEY, null) || {};
  let file = null, stat = null;
  for (const candidate of files) {
    try { stat = fs.statSync(/*turbopackIgnore: true*/ candidate); if (stat.isFile()) { file = candidate; break; } } catch { /* not there */ }
  }
  if (!file) return { ...previous, found: false, file: null };
  const mark = { file, modified_at: stat.mtime.toISOString(), size: stat.size };
  if (previous.file === file && previous.modified_at === mark.modified_at && previous.size === mark.size && !previous.error) return { ...previous, found: true };
  let status;
  try {
    if (stat.size > MAX_BYTES) throw new Error('The sleep file is larger than 2 MB. Make the Shortcut find only the last two days.');
    const samples = parseSamples(fs.readFileSync(/*turbopackIgnore: true*/ file, 'utf8'));
    if (!samples.length) throw new Error('The sleep file has no readable Sleep Analysis samples. Check the date format is ISO 8601 in the Shortcut.');
    const nights = samplesToNights(samples);
    const changed = writeHealthNights(db, nights, now);
    status = { ...mark, imported_at: now.toISOString(), samples: samples.length, nights: nights.length, changed, last_night: nights.at(-1)?.day || null, error: null };
  } catch (error) {
    status = { ...mark, imported_at: now.toISOString(), error: error.code === 'EDEADLK' || error.code === 'ETIMEDOUT' ? 'iCloud has not downloaded the sleep file yet.' : error.message };
  }
  writeSetting(db, HEALTH_KEY, status, now);
  return { ...status, found: true };
}
