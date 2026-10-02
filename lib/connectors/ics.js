// A small iCalendar (RFC 5545) reader: enough to show the events of a
// Google, iCloud, Outlook or Fastmail calendar feed on the Dash. It reads
// VEVENTs with their start, end or duration, timezone, recurrence (RRULE with
// FREQ, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY and BYMONTH), EXDATE,
// moved or cancelled occurrences (RECURRENCE-ID) and cancelled events.
// Everything is turned into instants and then into the local day and time.
import { zonedMeetingInstant } from '../zoned-time.js';
import { localToday, wallTime, validZone } from '../day.js';

const DAY_MS = 86400000;
const MAX_STEPS = 20000;
const MAX_SPAN_DAYS = 14;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// Outlook and Exchange name timezones the Windows way. The common ones, so an
// Outlook feed lands at the right hour; an unknown name falls back to UTC.
const WINDOWS_ZONES = {
  'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest', 'Central European Standard Time': 'Europe/Warsaw',
  'E. Europe Standard Time': 'Europe/Chisinau', 'FLE Standard Time': 'Europe/Kiev', 'GTB Standard Time': 'Europe/Bucharest',
  'Russian Standard Time': 'Europe/Moscow', 'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles', 'US Mountain Standard Time': 'America/Phoenix',
  'Alaskan Standard Time': 'America/Anchorage', 'Hawaiian Standard Time': 'Pacific/Honolulu', 'Atlantic Standard Time': 'America/Halifax',
  'E. South America Standard Time': 'America/Sao_Paulo', 'India Standard Time': 'Asia/Kolkata', 'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo', 'Korea Standard Time': 'Asia/Seoul', 'Singapore Standard Time': 'Asia/Singapore',
  'AUS Eastern Standard Time': 'Australia/Sydney', 'New Zealand Standard Time': 'Pacific/Auckland', 'Arabian Standard Time': 'Asia/Dubai',
  'Israel Standard Time': 'Asia/Jerusalem', 'South Africa Standard Time': 'Africa/Johannesburg', 'UTC': 'UTC',
};

export function zoneOf(tzid) {
  if (!tzid) return null;
  const name = String(tzid).replace(/^"|"$/g, '').replace(/^\/+/, '');
  if (validZone(name)) return name;
  if (WINDOWS_ZONES[name] && validZone(WINDOWS_ZONES[name])) return WINDOWS_ZONES[name];
  return 'UTC';
}

const unescape = value => value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/** The content lines of a feed: unfolded and split into { name, params, value }. */
export function contentLines(text) {
  const unfolded = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
  const lines = [];
  for (const raw of unfolded.split('\n')) {
    if (!raw.trim()) continue;
    // The value starts at the first colon outside a quoted parameter value.
    let quoted = false, at = -1;
    for (let i = 0; i < raw.length; i += 1) {
      if (raw[i] === '"') quoted = !quoted;
      else if (raw[i] === ':' && !quoted) { at = i; break; }
    }
    if (at < 0) continue;
    const [name, ...rest] = raw.slice(0, at).split(';');
    const params = {};
    for (const part of rest) {
      const eq = part.indexOf('=');
      if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
    }
    lines.push({ name: name.toUpperCase(), params, value: raw.slice(at + 1) });
  }
  return lines;
}

/** A DATE or DATE-TIME value: { date: 'YYYY-MM-DD', time: 'HH:MM' | null,
 *  zone: IANA name | 'UTC' | null (floating) }. */
export function parseWhen(value, params = {}) {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value || '').trim());
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  if (!match[4] || params.VALUE === 'DATE') return { date, time: null, zone: null };
  return { date, time: `${match[4]}:${match[5]}`, zone: match[7] ? 'UTC' : zoneOf(params.TZID) };
}

/** A timed value as an instant (ms). A floating time is read in `fallback`.
 *  A wall time a clock change skips or repeats is read as UTC plus the
 *  offset an hour later, which is right to within that hour. */
function instantOf(when, fallback) {
  const zone = when.zone || fallback;
  try { return Date.parse(zonedMeetingInstant(when.date, when.time, zone)); } catch {
    const later = Date.parse(when.date + 'T' + when.time + ':00Z') + 3600000;
    try {
      const shifted = new Date(later);
      const wall = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(shifted).replace(', ', 'T');
      return Date.parse(when.date + 'T' + when.time + ':00Z') - (Date.parse(wall + ':00Z') - later);
    } catch { return Date.parse(when.date + 'T' + when.time + ':00Z'); }
  }
}

/** ISO 8601 durations as ms: P1D, PT1H30M, P1W. */
export function durationMs(value) {
  const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(value || '').trim());
  if (!match) return null;
  const [, sign, w, d, h, m, s] = match;
  const ms = (((Number(w || 0) * 7 + Number(d || 0)) * 24 + Number(h || 0)) * 60 + Number(m || 0)) * 60000 + Number(s || 0) * 1000;
  return sign === '-' ? -ms : ms;
}

export function parseRule(value) {
  const rule = {};
  for (const part of String(value || '').split(';')) {
    const [key, raw] = part.split('=');
    if (key && raw !== undefined) rule[key.toUpperCase()] = raw;
  }
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(rule.FREQ)) return null;
  return {
    freq: rule.FREQ,
    interval: Math.max(1, Number.parseInt(rule.INTERVAL || '1', 10) || 1),
    count: rule.COUNT ? Math.max(0, Number.parseInt(rule.COUNT, 10) || 0) : null,
    until: rule.UNTIL ? parseWhen(rule.UNTIL) : null,
    byday: rule.BYDAY ? rule.BYDAY.split(',').map(item => /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(item.trim())).filter(Boolean).map(m => ({ n: m[1] ? Number(m[1]) : 0, day: WEEKDAYS.indexOf(m[2]) })) : [],
    bymonthday: rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number).filter(n => Number.isInteger(n) && n !== 0 && Math.abs(n) <= 31) : [],
    bymonth: rule.BYMONTH ? rule.BYMONTH.split(',').map(Number).filter(n => n >= 1 && n <= 12) : [],
  };
}

// Day arithmetic on YYYY-MM-DD strings, at midday UTC.
const noon = day => Date.parse(day + 'T12:00:00Z');
const dayOf = ms => new Date(ms).toISOString().slice(0, 10);
export const addDays = (day, n) => dayOf(noon(day) + n * DAY_MS);
const weekdayOf = day => new Date(noon(day)).getUTCDay();
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const ymd = (year, month, date) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;

/** The days of one month a BYDAY / BYMONTHDAY rule picks, sorted. */
function monthDays(year, month, rule, anchor) {
  const length = daysInMonth(year, month);
  const out = new Set();
  for (const n of rule.bymonthday) {
    const date = n > 0 ? n : length + n + 1;
    if (date >= 1 && date <= length) out.add(ymd(year, month, date));
  }
  for (const { n, day } of rule.byday) {
    const matches = [];
    for (let date = 1; date <= length; date += 1) if (weekdayOf(ymd(year, month, date)) === day) matches.push(ymd(year, month, date));
    if (!n) matches.forEach(item => out.add(item));
    else if (matches[n > 0 ? n - 1 : matches.length + n]) out.add(matches[n > 0 ? n - 1 : matches.length + n]);
  }
  if (!rule.bymonthday.length && !rule.byday.length && anchor <= length) out.add(ymd(year, month, anchor));
  return [...out].sort();
}

/** The start days of a rule, in order from the first, while `keep(day)` says
 *  to go on. Each candidate is passed to `visit`; stops after `count`. */
export function ruleDays(startDay, rule, { lastDay, visit }) {
  const anchor = Number(startDay.slice(8));
  const startMonth = Number(startDay.slice(5, 7)), startYear = Number(startDay.slice(0, 4));
  let produced = 0, steps = 0;
  const emit = day => {
    if (day < startDay) return true;
    if (day > lastDay) return false;
    if (rule.bymonth.length && rule.freq !== 'YEARLY' && !rule.bymonth.includes(Number(day.slice(5, 7)))) return true;
    produced += 1;
    if (visit(day, produced) === false) return false;
    return rule.count === null || produced < rule.count;
  };
  if (rule.freq === 'DAILY') {
    for (let day = startDay; steps++ < MAX_STEPS; day = addDays(day, rule.interval)) if (!emit(day)) return;
  } else if (rule.freq === 'WEEKLY') {
    const days = rule.byday.length ? [...new Set(rule.byday.map(item => item.day))] : [weekdayOf(startDay)];
    // Weeks start on Monday (WKST=MO, the default).
    const monday = addDays(startDay, -((weekdayOf(startDay) + 6) % 7));
    for (let week = monday; steps++ < MAX_STEPS; week = addDays(week, 7 * rule.interval)) {
      const inWeek = days.map(day => addDays(week, (day + 6) % 7)).sort();
      for (const day of inWeek) if (!emit(day)) return;
    }
  } else if (rule.freq === 'MONTHLY') {
    for (let index = 0; steps++ < MAX_STEPS; index += rule.interval) {
      const total = (startMonth - 1) + index;
      const year = startYear + Math.floor(total / 12), month = total % 12 + 1;
      if (ymd(year, month, 1) > lastDay) return;
      for (const day of monthDays(year, month, rule, anchor)) if (!emit(day)) return;
    }
  } else {
    const months = rule.bymonth.length ? rule.bymonth : [startMonth];
    for (let year = startYear; steps++ < MAX_STEPS; year += rule.interval) {
      if (ymd(year, 1, 1) > lastDay) return;
      for (const month of [...months].sort((a, b) => a - b)) {
        const picks = rule.byday.length || rule.bymonthday.length ? monthDays(year, month, rule, anchor) : (anchor <= daysInMonth(year, month) ? [ymd(year, month, anchor)] : []);
        for (const day of picks) if (!emit(day)) return;
      }
    }
  }
}

/** The VEVENTs of a feed as plain records. */
export function parseEvents(text) {
  const events = [];
  let current = null, depth = 0;
  for (const line of contentLines(text)) {
    if (line.name === 'BEGIN') {
      if (line.value.toUpperCase() === 'VEVENT' && !current) { current = { exdates: [] }; depth = 0; }
      else if (current) depth += 1;
      continue;
    }
    if (line.name === 'END') {
      if (current && depth > 0) { depth -= 1; continue; }
      if (current && line.value.toUpperCase() === 'VEVENT') { if (current.start) events.push(current); current = null; }
      continue;
    }
    if (!current || depth > 0) continue;
    if (line.name === 'UID') current.uid = line.value.trim();
    else if (line.name === 'SUMMARY') current.title = unescape(line.value).trim();
    else if (line.name === 'DTSTART') current.start = parseWhen(line.value, line.params);
    else if (line.name === 'DTEND') current.end = parseWhen(line.value, line.params);
    else if (line.name === 'DURATION') current.duration = durationMs(line.value);
    else if (line.name === 'RRULE') current.rule = parseRule(line.value);
    else if (line.name === 'EXDATE') for (const value of line.value.split(',')) { const when = parseWhen(value, line.params); if (when) current.exdates.push(when); }
    else if (line.name === 'RECURRENCE-ID') current.recurrence = parseWhen(line.value, line.params);
    else if (line.name === 'STATUS') current.cancelled = line.value.trim().toUpperCase() === 'CANCELLED';
  }
  return events;
}

/** What one occurrence shows: one item per local day it covers. */
function occurrenceItems(event, startDay, startMs, endMs, fallback) {
  const title = event.title || 'Busy';
  if (!event.start.time) {
    // All day: from its date up to (not including) its end date.
    const endDay = event.end && !event.end.time ? event.end.date : addDays(startDay, Math.max(1, Math.round((event.duration || DAY_MS) / DAY_MS)));
    const items = [];
    for (let day = startDay, n = 0; day < endDay && n < MAX_SPAN_DAYS; day = addDays(day, 1), n += 1) items.push({ day, time: null, minutes: null, title });
    return items.length ? items : [{ day: startDay, time: null, minutes: null, title }];
  }
  const first = localToday(new Date(startMs));
  const minutes = endMs > startMs ? Math.round((endMs - startMs) / 60000) : null;
  const items = [{ day: first, time: wallTime(new Date(startMs)), minutes, title }];
  // A timed event running past midnight shows on the following days too, all day.
  const lastDay = endMs > startMs ? localToday(new Date(endMs - 1)) : first;
  for (let day = addDays(first, 1), n = 0; day <= lastDay && n < MAX_SPAN_DAYS; day = addDays(day, 1), n += 1) items.push({ day, time: null, minutes: null, title });
  return items;
}

const keyOf = when => when.date + (when.time ? 'T' + when.time : '');

/**
 * The events of a feed that fall between two local days (both included), as
 * { id, title, day, time, minutes }. fallback: the zone a floating time is
 * read in (the user's own).
 */
export function expandEvents(text, { from, to, fallback = 'UTC', feedId = 'feed' } = {}) {
  const events = parseEvents(text);
  // Moved or cancelled single occurrences, by UID and original start.
  const overrides = new Map();
  for (const event of events) if (event.recurrence && event.uid) overrides.set(event.uid + '|' + keyOf(event.recurrence), event);
  const out = [];
  const add = (event, day, startMs, endMs, key) => {
    if (event.cancelled) return;
    for (const item of occurrenceItems(event, day, startMs, endMs, fallback)) {
      if (item.day < from || item.day > to) continue;
      out.push({ id: `${feedId}:${event.uid || event.title}:${key}:${item.day}`, ...item });
    }
  };
  // Look a little either side, so an event in another timezone that lands on
  // a neighbouring local day is still caught.
  const lastDay = addDays(to, 1);
  for (const event of events) {
    if (event.recurrence) {
      // An override shows where it now is.
      const startMs = event.start.time ? instantOf(event.start, fallback) : noon(event.start.date);
      add(event, event.start.date, startMs, endOf(event, startMs, fallback), keyOf(event.recurrence));
      continue;
    }
    const length = (() => {
      if (!event.start.time) return null;
      const start = instantOf(event.start, fallback);
      return endOf(event, start, fallback) - start;
    })();
    const occurrence = day => {
      const when = { ...event.start, date: day };
      const key = keyOf(when);
      if (event.exdates.some(ex => ex.date === day && (!ex.time || !when.time || ex.time === when.time || ex.zone === 'UTC'))) return;
      if (event.uid && overrides.has(event.uid + '|' + key)) return;
      const startMs = when.time ? instantOf(when, fallback) : noon(day);
      add(event, day, startMs, when.time ? startMs + Math.max(0, length || 0) : null, key);
    };
    if (!event.rule) { occurrence(event.start.date); continue; }
    const until = event.rule.until ? event.rule.until.date : null;
    const stop = until && until < lastDay ? until : lastDay;
    ruleDays(event.start.date, event.rule, { lastDay: stop, visit: day => { if (day >= addDays(from, -MAX_SPAN_DAYS)) occurrence(day); } });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title));
}

function endOf(event, startMs, fallback) {
  if (!event.start.time) return null;
  if (event.end?.time) return instantOf(event.end, fallback);
  if (Number.isFinite(event.duration)) return startMs + event.duration;
  return startMs;
}
