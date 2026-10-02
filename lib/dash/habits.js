// The Habits widget: the habit list with streaks (the same records as the
// flower) over the four-week consistency map of project work.
import { flowerView } from './flower.js';
import { consistency } from './consistency.js';
import { HABIT_COUNT } from '../simple/habits.js';

export function habitsView(db, state, today) {
  const { habits } = flowerView(db, today);
  return {
    // tracked/since/dormant: a habit counts from its first tick (see
    // lib/dash/flower.js), so a row can show that it is not tracked yet, or
    // that it is resting after a long gap.
    habits: habits.map(({ id, name, time_of_day, icon, icon_picked, streak, checked_today, checked_yesterday, tracked, since, dormant }) => ({ id, name, time_of_day, icon, icon_picked, streak, checked_today, checked_yesterday, tracked, since, dormant })),
    // You keep exactly this many habits (lib/simple/habits.js).
    limit: HABIT_COUNT,
    // The planning file is the only source of project tasks. When it cannot be
    // read the map says so instead of drawing an empty quarter.
    consistency: state ? consistency(state, today) : null,
    consistency_error: state ? null : 'Tasks are unavailable right now.',
    today,
  };
}
