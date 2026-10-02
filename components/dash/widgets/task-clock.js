// components/dash/widgets/task-clock.js
// The play and stop button's pure parts: how full its ring is,
// whether the run has passed the estimate, and the words that live only in
// its tooltip and label. The row itself shows no numbers. Plain imports, so
// node --test reads it.
import { formatEstimate } from '../../../lib/dash/estimate.js';
import { wallTime } from '../../../lib/day.js';

// A 26px button with a ring of radius 11.5 around the icon.
export const RING = Object.freeze({ size: 26, radius: 11.5, length: 2 * Math.PI * 11.5 });

const local = iso => wallTime(new Date(iso));

/** clock: the row's clock (lib/dash/tasks.js) or null; extra: wall minutes since the load. */
export function clockView(clock, { title = '', extra = 0 } = {}) {
  if (!clock) return { running: false, ratio: 0, offset: RING.length, over: false, minutes: 0, label: 'Start ' + title, tip: 'Start' };
  const minutes = Math.round((clock.minutes || 0) + (clock.by === 'wall' ? extra : 0));
  const estimate = clock.estimate_minutes > 0 ? clock.estimate_minutes : null;
  const ratio = estimate ? Math.min(1, minutes / estimate) : 0;
  const over = !!estimate && minutes > estimate;
  const where = clock.by === 'tape' ? ' on this project' : '';
  const soFar = `${formatEstimate(minutes)}${where} so far${estimate ? ' of ~' + formatEstimate(estimate) : ''}`;
  const tip = `Started ${local(clock.started_at)}. ${soFar}. Stop`;
  return { running: true, ratio, offset: RING.length * (1 - ratio), over, minutes, label: `Stop ${title}. ${soFar}`, tip };
}
