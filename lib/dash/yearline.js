// The Dash year line: how much of the year is gone, where the months start,
// and a flag for every project due this year plus "Year end". A project's day
// is its deadline. Positions are
// percentages of the year so the component only places them.
import { ensureProjects, listProjects } from '../simple/projects.js';
import { placeFlags } from './yearline-layout.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const round2 = value => Math.round(value * 100) / 100;
const utc = day => Date.parse(day + 'T00:00:00Z');

/** Day of the year, 1 on 1 January. */
export const dayOfYear = day => Math.round((utc(day) - Date.UTC(Number(day.slice(0, 4)), 0, 1)) / DAY_MS) + 1;
export const daysInYear = year => (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS;
export const shortDate = day => Number(day.slice(8, 10)) + ' ' + MONTHS[Number(day.slice(5, 7)) - 1];

/** The year so far for a local day (YYYY-MM-DD). */
export function yearProgress(today) {
  if (!DAY.test(today || '') || !Number.isFinite(utc(today))) throw new Error('Use a YYYY-MM-DD day.');
  const year = Number(today.slice(0, 4)), days = daysInYear(year), doy = dayOfYear(today);
  return {
    year, days, day_of_year: doy, days_left: days - doy,
    pct_gone: Math.round(doy / days * 100),
    // The now marker and the gone segment end at the close of today.
    now_at: round2(doy / days * 100),
    // A month tick sits where its first day starts.
    months: MONTHS.map((label, month) => ({ label, at: round2((utc(`${year}-${String(month + 1).padStart(2, '0')}-01`) - Date.UTC(year, 0, 1)) / DAY_MS / days * 100) })),
  };
}

export { placeFlags, labelSpans } from './yearline-layout.js';

/**
 * Flags for the projects due in this year, then Year end. A project is due on its
 * `deadline`. Laid out by placeFlags (yearline-layout.js) at `layout`'s
 * width, the 1440 px page's unless it says otherwise; the browser lays them
 * out again at the width it draws.
 */
export function yearFlags(projects, year, layout = {}) {
  const days = daysInYear(year);
  const dayOf = project => project.deadline;
  const deadlines = projects
    .filter(project => typeof dayOf(project) === 'string' && dayOf(project).startsWith(year + '-') && DAY.test(dayOf(project)))
    .sort((a, b) => dayOf(a).localeCompare(dayOf(b)) || a.name.localeCompare(b.name))
    .map(project => ({ id: project.id, name: project.name, domain: project.domain, day: dayOf(project), on: shortDate(dayOf(project)), at: round2(dayOfYear(dayOf(project)) / days * 100) }));
  return placeFlags([...deadlines, { id: 'year-end', name: 'Year end', domain: null, day: `${year}-12-31`, on: '', at: 100 }], layout);
}

export function yearlineData(db, { today }) {
  ensureProjects(db);
  const progress = yearProgress(today);
  return { ...progress, flags: yearFlags(listProjects(db), progress.year), forks: [], fork_title: null };
}

export const loadYearline = async ({ db, today, now }) => yearlineData(db, { today, now });
