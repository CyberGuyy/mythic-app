// Task estimates: an optional estimate_minutes on the task record, a whole
// number from 5 to 1440 or null. Estimates allocate portions of the day and
// size a project ; nothing on screen is a timer.
// Plain functions with no imports, so the tasks route, the Dash loader and the
// client widget all read the same rules.

export const ESTIMATE_MIN = 5;
export const ESTIMATE_MAX = 1440;
/** The choices the row's estimate menu offers, in minutes. */
export const ESTIMATE_CHOICES = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];

/** A stored estimate, or null when there is none or it is not a valid one. */
export function estimateOf(task) {
  const value = task?.estimate_minutes;
  return Number.isInteger(value) && value >= ESTIMATE_MIN && value <= ESTIMATE_MAX ? value : null;
}

/** An estimate sent by a client: undefined leaves it alone, null or '' clears
 *  it, anything else must be whole minutes from 5 to 1440. */
export function cleanEstimate(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (!Number.isInteger(number) || number < ESTIMATE_MIN || number > ESTIMATE_MAX) throw new Error('An estimate is whole minutes from 5 to 1440.');
  return number;
}

/** 45 -> 45m, 60 -> 1h, 90 -> 1h 30m. */
export function formatEstimate(minutes) {
  const m = Math.round(Number(minutes) || 0);
  if (m < 60) return m + 'm';
  const rest = m % 60;
  return Math.floor(m / 60) + 'h' + (rest ? ' ' + String(rest).padStart(2, '0') + 'm' : '');
}

/** Hours as the week widget shows them: 7, 7.5, 0. */
export function formatHours(hours) {
  const h = Math.round((Number(hours) || 0) * 2) / 2;
  return (h % 1 ? h.toFixed(1) : String(h)) + 'h';
}
