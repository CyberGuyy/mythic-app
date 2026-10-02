// The habit flower's fixed rules and ladder, from the design mockups
// Plain data and pure functions only: lib/dash/flower.js (server) and
// components/dash/widgets/Flower.jsx (client) both import this file.

export const NEED = 14;     // flower streak days for an upgrade
export const FILL = 7;      // ticked days in the last FILL that fill a petal
export const DAYS = 28;     // history per habit, oldest first, the last is today
export const N = 14;        // days the new colour takes to seep through the flower
export const CRACKS = 24;   // crack pool per petal
export const HEAL = 14;     // days a crack takes to fill back in
export const DEATH = 7;     // open cracks that kill a petal
export const MAX_PETALS = 8;
export const DORMANT = 28;  // days without a tick that put a habit to rest: no cracks, a fresh start on the next tick

/** The ladder, tip to centre: each upgrade is the next one, always. */
export const STYLES = [
  ['Crimson', [[132, 26, 52], [196, 36, 58], [236, 76, 84], [255, 132, 124]]],
  ['Ember', [[255, 214, 92], [255, 150, 56], [244, 88, 44], [226, 44, 60]]],
  ['Gold', [[196, 132, 36], [238, 186, 58], [255, 224, 112], [255, 246, 196]]],
  ['Jade', [[28, 112, 84], [56, 166, 118], [122, 214, 160], [206, 246, 214]]],
  ['Frost', [[58, 138, 140], [132, 196, 192], [214, 236, 232], [255, 255, 255]]],
  ['Iris', [[104, 66, 216], [166, 90, 238], [228, 120, 240], [255, 192, 240]]],
];
export const TOP_STYLE = STYLES.length - 1;
export const STAGES = ['Sprout', 'Back row', 'Outer ring', 'Vines', 'Extra petals', 'Full bloom'];
export const GROW = ['', 'the back row grows in', 'an outer ring grows in', 'vines grow out', 'extra petals grow in', 'the bush is in full bloom'];
export const NEXT = ['', 'the back row', 'an outer ring', 'vines', 'extra petals', 'full bloom'];
export const MAX_BUSH = STAGES.length - 1;

/** How many habits a day needs to count toward the flower: bloom.js's KEEP of
 *  3 out of 5, as a share (60%), never less than one. */
export const keepFor = count => Math.max(1, Math.ceil(0.6 * count));

/** How far a habit's petal has grown, 0 to 1 (the
 *  Bloom loop: the flower grows, then changes gradients; this overrides round
 *  15's fixed petal size). It is the habit's ticked days in the last FILL days,
 *  today included, over FILL: a first tick is 1/FILL, a bud at the base, and
 *  FILL ticks in the window is the full petal. FILL is a week so the first full
 *  petal comes in days; upgrades still take a NEED day streak. Only days from `since` (the
 *  index in `history` where the habit's tracked history starts) count, so a
 *  fresh start or a rest after DORMANT days starts the petal from nothing
 *  again; since null (never ticked, or resting) is 0: nothing filled, only the
 *  petal's outline. */
export function growthOf(history, since) {
  if (since === null || since === undefined || !history?.length) return 0;
  let ticked = 0;
  for (let i = Math.max(0, since, history.length - FILL); i < history.length; i += 1) if (history[i]) ticked += 1;
  return Math.min(1, ticked / FILL);
}

/** The ladder as the loader sends it. */
export const ladder = () => STYLES.map(([name, stops], index) => ({ index, name, stops, stage: STAGES[Math.min(index, MAX_BUSH)], brings: NEXT[index] || '' }));
