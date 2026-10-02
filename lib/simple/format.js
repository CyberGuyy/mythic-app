// Labels the pages print. Intl only, so a client component may import it.
import { localToday, wallTime, timeZone } from '../day.js';

const TIME = { format: date => wallTime(date) };
const DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

export const localTime = iso => TIME.format(new Date(iso));
export const dayLabel = day => DAY.format(new Date(day + 'T12:00:00Z'));

function shiftDay(day, delta) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function whenLabel(iso, now = new Date()) {
  const day = localToday(new Date(iso)), today = localToday(now);
  if (day === today) return 'Today ' + localTime(iso);
  if (day === shiftDay(today, -1)) return 'Yesterday ' + localTime(iso);
  return dayLabel(day) + ' · ' + localTime(iso);
}

export const numberWord = n => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/** The ISO-8601 week number of a YYYY-MM-DD day. Weeks start Monday. */
export function isoWeek(day) {
  const date = new Date(day + 'T00:00:00Z');
  // Thursday of this week decides the year the week belongs to.
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

/** Pounds for the page: whole pounds without pence, otherwise two places. */
export const pounds = amount => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount);

/** Long dashes become short ones wherever a report or a post reaches a page:
 *  the page uses short hyphens only. */
export function dashless(value) {
  if (typeof value === 'string') return value.replace(/[\u2012\u2013\u2014\u2015\u2212]/g, '-');
  if (Array.isArray(value)) return value.map(dashless);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, dashless(item)]));
  return value;
}
