// The habit flower's rules. Pure functions only: lib/dash/flower.js runs them on the server and
// components/dash/bloom/draw.js draws what they return.
//
// A petal grows from its habit's first tick, a seventh per ticked day, and
// never shrinks. A missed day tears a rip; misses in a row tear it further
// and rot it, and KILL in a row kill it. A run heals once you are back, in
// HEAL_DAYS. A dead petal stays a husk until the next tick starts it fresh.
// A day with keepFor(habits) ticked is a good day, and every TIER_DAYS good
// days unlock the next colour. A new colour grows in from the middle of each
// petal with that habit's ticks; once it covers every petal it is complete,
// and only then does it bring its bush stage, insect and world. A thriving day
// has every petal full with no run of two or more still showing; thriving
// days add up for good and unlock the LADDER.
import { STYLES, keepFor } from './flower-rules.js';

export const FILL = 7;
export const KILL = 5;
export const TIER_DAYS = 14;
/** days a run heals in, by its length (1 to 4 in a row) */
export const HEAL_DAYS = [0, 3, 5, 6, 7];
/** a single missed day tears from the tip or one side; a run tears the same place further */
export const CHIP_POOL = ['tip', 'lefthigh', 'righthigh', 'leftlow', 'rightlow'];
/** thriving days that unlock each quiet reward, for good */
export const LADDER = [[7, 'glow', 'Glow'], [14, 'pollen', 'Pollen'], [21, 'dew', 'Dew'], [28, 'sun', 'Sunlight']];
/** the world each colour brings once it is complete: Crimson has none, Ember the night sky, and so on */
export const WORLD_ORDER = ['none', 'sky', 'pond', 'daylight', 'planet', 'orb'];
export const WORLD_NAMES = { none: 'None', sky: 'Night sky', pond: 'Pond', daylight: 'Daylight', planet: 'Planet', orb: 'Glass orb' };
export const TOP_TIER = STYLES.length - 1;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const DAY_MS = 86400000;
/** a YYYY-MM-DD day as a whole day number */
export const dayNum = day => Math.round(Date.parse(day + 'T12:00:00Z') / DAY_MS);

export function rng(seed) { let x = (seed * 2654435761) >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

/** Give each miss its tear and its place in a run. events: [{ petal, day }].
 *  run is 1 for a miss after a ticked day, 2 for the second in a row, and so
 *  on. A first miss tears from a place not already showing on the petal; every
 *  later day of the run tears the first one further (origin). */
export function assign(events) {
  const out = [], days = [...new Set(events.map(e => e.day))].sort((a, b) => a - b);
  for (const day of days) {
    const inUse = new Set(out.filter(e => day - e.day < 7).map(e => e.pattern));
    for (const e of events.filter(x => x.day === day)) {
      const prev = out.find(o => o.petal === e.petal && o.day === day - 1), run = prev ? prev.run + 1 : 1;
      const pool = run === 1 ? CHIP_POOL : ['bigrip'];
      let cand = pool.filter(p => !inUse.has(p));
      if (!cand.length) cand = pool;
      const r = rng(day * 97 + e.petal * 13 + 1), pattern = cand[Math.floor(r() * cand.length)];
      inUse.add(pattern);
      const seed = day * 131 + e.petal * 977 + 7;
      out.push({ ...e, pattern, run, seed, origin: prev ? prev.origin : { pattern, seed } });
    }
  }
  return out;
}

/** The runs on one petal: misses sharing a first rip heal together, from the
 *  day after the latest of them. back (0 to 1) is how far today's tick has
 *  landed: ticking today already counts as a day of healing. u is how far the
 *  run has healed, front-loaded so most of it clears in the first days. */
export function runsOf(misses) {
  const groups = new Map();
  for (const m of misses || []) {
    const key = m.origin ? m.origin.pattern + ':' + m.origin.seed : 'own:' + m.seed;
    const g = groups.get(key) || { len: 0, age: Infinity, list: [], back: 0 };
    g.len = Math.max(g.len, m.run || 1); g.age = Math.min(g.age, m.age); g.back = Math.max(g.back, Number(m.back) || 0); g.list.push(m); groups.set(key, g);
  }
  for (const g of groups.values()) {
    const raw = clamp((g.age - 1 + g.back) / HEAL_DAYS[Math.min(4, g.len)]);
    g.u = raw >= 1 ? 1 : 1 - Math.pow(1 - raw, 2.4);
  }
  return [...groups.values()];
}

/** A petal on day d (1-based) of its tick string ('1' ticked), whose first day
 *  is day number `off + 1`. Today's missing tick is not a miss until the day
 *  is over. Miss days are absolute day numbers, so misses on the same day line
 *  up across petals. */
export function stateAt(ticks, d, petal = 0, off = 0) {
  const events = [];
  for (let x = 1; x < d; x++) if (ticks[x - 1] === '0') events.push({ petal, day: x + off });
  const all = assign(events);
  let from = 1;
  /* a petal that died starts fresh on the first tick after it */
  for (const e of all) if (e.run === KILL) { const back = [...ticks].findIndex((t, x) => x + 1 + off > e.day && x + 1 <= d && t === '1'); if (back >= 0) from = back + 1; }
  let n = 0; for (let x = from; x <= d; x++) n += ticks[x - 1] === '1' ? 1 : 0;
  const back = ticks[d - 1] === '1' ? 1 : 0;
  const misses = all.filter(e => e.day >= from + off).map(e => ({ ...e, age: d + off - e.day, back }));
  const dead = misses.some(m => m.run >= KILL);
  return { growth: Math.min(1, n / FILL), misses, dead, restart: from === d && from > 1 };
}

/** How far a new colour has grown into one petal: its ticks from the colour's unlock day, over FILL. */
export const growIn = (ticks, fromIndex, d) => { let n = 0; for (let x = Math.max(1, fromIndex); x <= d; x++) n += ticks[x - 1] === '1' ? 1 : 0; return Math.min(1, n / FILL); };

/** The whole flower's progress, replayed day by day. rows: one tick string per
 *  habit over the same days (index 0 is the first day counted, the last is
 *  today), with '-' before the habit's first tick. Returns the colour reached
 *  (tier), the colour complete (done), the day index each colour unlocked,
 *  good days, thriving days in total and in a row, and whether today thrives. */
export function progress(rows) {
  const H = rows.length, D = H ? rows[0].length : 0, keep = keepFor(Math.max(1, H));
  const P = rows.map(() => ({ started: false, dead: false, n: 0, miss: 0, runs: [], newN: 0 }));
  let good = 0, tier = 0, done = 0, thrivingTotal = 0, streak = 0, thriving = false;
  const unlocked = [0];
  for (let d = 0; d < D; d++) {
    const on = rows.map(r => r[d] === '1');
    /* yesterday's outcome first: a miss adds to its run */
    if (d > 0) rows.forEach((r, h) => {
      const p = P[h]; if (!p.started || r[d - 1] !== '0') { if (r[d - 1] === '1') p.miss = 0; return; }
      p.miss += 1;
      if (p.miss === 1) p.runs.push({ len: 1, end: d - 1 }); else { const last = p.runs[p.runs.length - 1]; last.len += 1; last.end = d - 1; }
      if (p.miss >= KILL) p.dead = true;
    });
    on.forEach((t, h) => {
      const p = P[h]; if (!t) return;
      if (!p.started || p.dead) { p.started = true; p.dead = false; p.n = 0; p.runs = []; p.miss = 0; }
      p.n += 1;
    });
    /* good days and the colour they unlock: one colour at a time, and the next only once this one is complete */
    if (on.filter(Boolean).length >= keep) good += 1;
    if (tier < TOP_TIER && Math.floor(good / TIER_DAYS) > tier && done >= tier) { tier += 1; unlocked[tier] = d; P.forEach(p => { p.newN = 0; }); }
    if (tier > done) {
      on.forEach((t, h) => { if (t) P[h].newN += 1; });
      const covered = P.every(p => !p.started || p.dead || Math.min(1, p.newN / FILL) >= Math.min(1, p.n / FILL));
      if (covered) done = tier;
    }
    /* thriving: every petal full, with no run of two or more still showing; a day with all five missed pauses it while it heals */
    const offDay = [1, 2, 3].some(b => d - b >= 0 && rows.every(r => r[d - b] !== '1'));
    thriving = H > 0 && !offDay && P.every((p, h) => {
      if (!p.started || p.dead || p.n < FILL) return false;
      return !p.runs.some(run => run.len >= 2 && (d - run.end - 1 + (on[h] ? 1 : 0)) < HEAL_DAYS[Math.min(4, run.len)]);
    });
    if (thriving) { thrivingTotal += 1; streak += 1; } else streak = 0;
  }
  const into = good - TIER_DAYS * tier;
  return { tier, done, unlocked, good, toward: tier >= TOP_TIER ? TIER_DAYS : Math.max(0, Math.min(TIER_DAYS, into)), thrivingTotal, streak, thriving, keep };
}

/** Whether a colour's visitor has come, which is a milestone: Crimson's on the
 *  first thriving day (every petal full), every later colour's once it has
 *  grown in through every petal. state is flowerView's. */
export const visitorCame = (state, tier) => tier <= state.done && (tier > 0 || state.thriving_total > 0);

/** The quiet rewards the thriving days have unlocked so far. */
export const ladderAt = total => LADDER.filter(([days]) => total >= days).map(([, id, name]) => ({ id, name }));
