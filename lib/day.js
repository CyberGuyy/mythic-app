// The local day. Mythic's day boundary is the timezone chosen in onboarding,
// whatever the machine's clock says, and the browser needs the same answer as
// the server. The server sets it from settings on every request
// (lib/settings.js); the client sets it from the page's props (DashShell).
// This module holds only Intl, so client components can import it.

const FALLBACK = 'UTC';
let zone = validZone(typeof process !== 'undefined' && process.env?.MYTHIC_TIMEZONE) ? process.env.MYTHIC_TIMEZONE : FALLBACK;

/** True for an IANA timezone this runtime knows, such as Europe/London. */
export function validZone(value) {
  if (typeof value !== 'string' || !value || value.length > 80) return false;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: value }).format(); return true; } catch { return false; }
}

/** The timezone the day is counted in. */
export const timeZone = () => zone;

/** Change the timezone; an unknown one is ignored. */
export function setTimeZone(value) {
  if (validZone(value)) zone = value;
  return zone;
}

const cache = new Map();
/** An Intl.DateTimeFormat in the current timezone, cached per zone and options. */
export function zoned(locale, options) {
  const key = zone + '|' + locale + '|' + JSON.stringify(options);
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat(locale, { ...options, timeZone: zone }));
  return cache.get(key);
}

/** Today's date in the local timezone as YYYY-MM-DD. */
export function localToday(now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return zoned('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** The local wall-clock time of an instant as HH:MM. */
export function wallTime(date = new Date()) {
  return zoned('en-GB', { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(date);
}

/** Local midnight, whatever the machine's own clock is set to. */
export function localDayStart(now = new Date()) {
  const [hours, minutes] = wallTime(now).split(':').map(Number);
  return new Date(now.getTime() - (hours * 60 + minutes) * 60000 - now.getSeconds() * 1000 - now.getMilliseconds());
}
