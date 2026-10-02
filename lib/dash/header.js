// The Dash header: the date, the week, the local time and today's score.
// Today's tasks are the ones due today or overdue plus the ones finished
// today, read through simpleTasks so the header and the Tasks page agree.
// Urgent is narrower than "left today": open tasks already overdue or marked
// priority (is_priority, set by setPriority in lib/task-list.js), each once.
import { isOpen } from '../task-list.js';
import { simpleTasks, dueGroupOf } from '../simple/tasks-view.js';
import { isoWeek } from '../simple/format.js';
import { wallTime } from '../day.js';
import { localToday } from '../day.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_JP = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The labels of a local day (YYYY-MM-DD): 'Sunday', '20 September', week 38. */
export function dayLabels(day) {
  const date = new Date(day + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || Number.isNaN(date.getTime())) throw new Error('Use a YYYY-MM-DD day.');
  const weekday = WEEKDAYS[date.getUTCDay()];
  const dateLabel = date.getUTCDate() + ' ' + MONTHS[date.getUTCMonth()];
  return { weekday, date_label: dateLabel, day_label: weekday + ' ' + dateLabel, weekday_jp: WEEKDAYS_JP[date.getUTCDay()], week: isoWeek(day) };
}

/** Open tasks that are overdue on the local day or carry the priority flag. */
export function urgentCount(state, today) {
  return Object.values(state?.tasks_by_id || {})
    .filter(task => isOpen(task) && (task.is_priority || dueGroupOf(task, today) === 'overdue'))
    .length;
}

/** The tail of the subline: '3 left today, 1 urgent'. A zero urgent is left out. */
export function restLabel({ left, urgent, total }) {
  const head = !total ? 'nothing due today' : !left ? 'all done today' : `${left} left today`;
  return urgent ? `${head}, ${urgent} urgent` : head;
}

/** Today's score from the planning state. Null state means the planning file
 *  could not be read: that is an error card, not an empty day. */
export function headerData(state, { now = new Date(), today = localToday(now) } = {}) {
  if (!state) throw new Error('Tasks are unavailable right now.');
  const { counts } = simpleTasks(state, { view: 'today', now });
  const done = counts.done;
  // Open and due today or overdue: what is left of today.
  const left = counts.today;
  const urgent = urgentCount(state, today);
  const total = done + left;
  return {
    // The local day the page was drawn for, so the client can refresh at midnight.
    day: today,
    ...dayLabels(today),
    time_label: wallTime(now),
    done, total, left, urgent,
    rest: restLabel({ left, urgent, total }),
    pct: total ? Math.round(done / total * 100) : 0,
  };
}

export const loadHeader = async ({ state, now, today }) => headerData(state, { now, today });
