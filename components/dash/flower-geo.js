// The habit flower's geometry and colour maths, ported from
// the design mockups unchanged for five petals. bloom.js draws five
// habits; here the petal count follows the habit count (1 to 8): the track
// and bush layers get one petal (or two, for the thin ring) per habit at the
// same offsets bloom.js uses between five, and petals narrow past five so
// neighbours still meet. Pure functions, no DOM: Flower.jsx draws with them.
// The goal is a faint outline (goal(g)): at first only the petals, one per
// habit at full size (outline(g, false)); once the bush is revealed (a petal
// full or the streak at 14, lib/dash/flower.js) every bush stage too
// (outline(g, true)). What is earned fills it in: each petal as a whole small
// petal grown from its base, larger with its growth (growthOf in
// lib/dash/flower-rules.js; drawn(g, h, growth) is the filled part) and, after the reveal, the bush stages the flower has
// reached by upgrades (bushFill(g, bush, revealed)).
import { STYLES, DAYS, CRACKS, HEAL, DEATH, FILL } from '../../lib/dash/flower-rules.js';

export const G = 88, SC = 30, EYE = .1;
export const W = [255, 255, 255];
export const ramp = (ST, u) => { u = Math.min(.9999, Math.max(0, u)) * (ST.length - 1); const k = u | 0, f = u - k; return ST[k].map((v, c) => v + (ST[k + 1][c] - v) * f); };
export const mul = (c, f) => c.map(v => Math.min(255, v * f));
export const mix = (a, b, f) => a.map((v, c) => v + (b[c] - v) * f);
export const css = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
export const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
export const ease = u => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
const D2R = Math.PI / 180;
export const B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map(r => r.map(v => v / 16));
const profRaw = t => Math.pow(Math.sin(Math.PI * Math.pow(t, 1.3)), .62);
let pm = 0; for (let i = 1; i < 200; i++) pm = Math.max(pm, profRaw(i / 200));
const prof = t => profRaw(Math.min(.9999, Math.max(1e-4, t))) / pm;

function layersFor(H) {
  // bloom.js: five petals of width .33; past five, narrow them so they still meet.
  const width = H > 5 ? .33 * Math.sin(Math.PI / H) / Math.sin(Math.PI / 5) : .33;
  const TRACK = { role: 'track', n: H, jit: 2, vr: .04, r0: .1, L: 1, W: width };
  const between = 180 / H, k = width / .33;
  const DECO = [
    { role: 'deco', n: H, off: between, r0: .1, L: .92, W: .42 * k, gain: .4, den: .9 },
    { role: 'deco', n: 2 * H, off: between / 2, r0: .5, L: .78, W: .13 * k, gain: .3, den: .6 },
    { role: 'deco', n: H, off: between, r0: .62, L: .82, W: .17 * k, gain: .32, den: .75 },
  ];
  return [TRACK, ...DECO];
}

function frame(x, y, P, k, sc) { const a = ((P.off || 0) + k * 360 / P.n + (P.jit || 0) * Math.sin(k * 2.3)) * D2R, ux = Math.sin(a), uy = -Math.cos(a), L = P.L * sc * (1 + (P.vr || 0) * Math.cos(k * 1.7 + 1)), al = x * ux + y * uy, ac = -x * uy + y * ux, t = (al - (P.r0 || 0) * sc) / L; if (t <= 0 || t >= 1) return null; const hw = P.W * sc * prof(t); if (Math.abs(ac) > hw + .25) return null; return [t, Math.max(-1, Math.min(1, ac / Math.max(hw, .3)))]; }
function owner(x, y, layers, sc, H) {
  if (Math.hypot(x, y) < EYE * sc) return { kind: 'eye', r: Math.hypot(x, y) / (EYE * sc) };
  for (let li = 0; li < layers.length; li++) { const P = layers[li]; let hit = null, hits = 0; for (let k = 0; k < P.n; k++) { const f = frame(x, y, P, k, sc); if (f) hits++; if (f && (!hit || Math.abs(f[1]) < Math.abs(hit[1][1]))) hit = [k, f]; } if (hits > 1 && P.role === 'track') return { kind: 'seam' }; if (hit) return { kind: P.role, k: hit[0], habit: ((hit[0] * H / P.n) | 0) % H, t: hit[1][0], q: hit[1][1], li: li - 1, P }; }
  return null;
}

function buildStrips(H, sc = SC) {
  const layers = layersFor(H), track = [], deco = [], eye = [], dust = [], shape = [], seam = [];
  const inside = (t, q, s) => t < s && Math.abs(q) * prof(t) <= s * prof(t / s) + 1e-6;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const e = owner(i + .5 - G / 2, j + .5 - G / 2, layers, sc, H); if (!e) continue;
    if (e.kind === 'eye') { eye.push([i, j, e.r]); continue; } if (e.kind === 'seam') { seam.push([i, j]); continue; }
    if (e.kind === 'track') { let lo = 0, hi = 1; for (let n = 0; n < 14; n++) { const m = (lo + hi) / 2; if (inside(e.t, e.q, m)) hi = m; else lo = m; } track.push([i, j, e.habit, hi, e.t, e.q]); }
    else { shape.push([i, j, e.li, e.k]); if (B4[j % 4][i % 4] > e.P.den * (1 - .4 * e.t * e.t)) continue; const x = i + .5 - G / 2, y = j + .5 - G / 2, reach = (Math.hypot(x, y) / sc - .1) / (e.P.r0 + e.P.L - .1); deco.push([i, j, e.t, Math.abs(e.q), e.habit, e.P.gain, e.li, reach]); }
  }
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648; const R = 1.15 * sc;
  for (let n = 0; n < 70; n++) { const a = rnd() * 2 * Math.PI, rr = R * (.98 + .45 * Math.pow(rnd(), 1.6)); dust.push([(G / 2 + Math.cos(a) * rr) | 0, (G / 2 + Math.sin(a) * rr) | 0]); }
  const vines = [], seen = new Set(), put = (px, py) => { const key = (px | 0) + ',' + (py | 0); if (!seen.has(key)) { seen.add(key); vines.push([px | 0, py | 0]); } };
  for (let k = 0; k < H; k++) { const a0 = (180 / H + 360 / H * k + 8 * Math.sin(k * 2.1)) * D2R; for (let n = 0; n <= 40; n++) { const u = n / 40, a = a0 + .5 * Math.sin(u * 2.6 + k) * u, rr = sc * (1.08 + .34 * u); put(G / 2 + Math.cos(a) * rr, G / 2 + Math.sin(a) * rr); if (n === 22) for (let m = 1; m <= 6; m++) put(G / 2 + Math.cos(a + .06 * m) * (rr + m * 1.1), G / 2 + Math.sin(a + .06 * m) * (rr + m * 1.1)); } }
  const g = { G, sc, H, track, deco, eye, dust, vines, shape, seam };   /* shape: every cell of every bush layer, before the dither that picks g.deco from it */
  /* each petal's cells from base to tip, by t along the petal's axis */
  g.byT = Array.from({ length: H }, (_, h) => track.filter(c => c[2] === h).sort((a, b) => a[4] - b[4]));
  /* and by the smallest petal, grown from the base, each cell sits inside (its Sx): drawn() takes a prefix */
  g.bySx = Array.from({ length: H }, (_, h) => track.filter(c => c[2] === h).sort((a, b) => a[3] - b[3]));
  /* cracks: a pool of CRACKS jagged lines walked across each petal, edge to edge, at random points along it. A missed day opens one */
  const at = new Map(); g.track.forEach(c => { c[6] = []; at.set(c[0] + ',' + c[1], c); });
  let cs = 11; const crnd = () => (cs = (cs * 1103515245 + 12345) % 2147483648) / 2147483648, mark = (c, k) => { if (!c[6].includes(k)) c[6].push(k); };
  for (let h = 0; h < H; h++) {
    const cells = g.track.filter(c => c[2] === h);
    for (let k = 0; k < CRACKS; k++) {
      const side = k % 2 ? 1 : -1, t0 = .15 + .8 * crnd(), starts = cells.filter(c => c[5] * side > .6 && Math.abs(c[4] - t0) < .12); if (!starts.length) continue;
      const tt = t0 + (crnd() - .5) * .3, ends = cells.filter(c => c[5] * side < -.6 && Math.abs(c[4] - tt) < .15); if (!ends.length) continue;
      const b = ends[(crnd() * ends.length) | 0]; let cur = starts[(crnd() * starts.length) | 0];
      for (let n = 0; n < 80 && cur !== b; n++) { mark(cur, k); let best = null, bs = Infinity; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const nb = (dx || dy) && at.get((cur[0] + dx) + ',' + (cur[1] + dy)); if (!nb) continue; const sc2 = Math.hypot(b[0] - nb[0], b[1] - nb[1]) + crnd() * 1.4; if (sc2 < bs) { bs = sc2; best = nb; } } if (!best) break; cur = best; }
      mark(b, k);
    }
  }
  return g;
}

const cache = new Map();
/** The flower's cells for H petals, built once per count. */
export function geometry(H) {
  const n = Math.max(1, Math.min(8, H | 0));
  if (!cache.has(n)) cache.set(n, buildStrips(n));
  return cache.get(n);
}

/** Each petal's boundary: rim(g)[h] is the list of petal h's track cells
 *  with at least one 4-neighbour outside the petal (a seam, the eye, another
 *  petal or empty space). Built once per geometry. It is the petal's line in
 *  the goal outline, and Flower.jsx draws the hover highlight on it. */
export function rim(g) {
  if (g.rim) return g.rim;
  const own = new Map();
  for (const c of g.track) own.set(c[0] + ',' + c[1], c[2]);
  const out = Array.from({ length: g.H }, () => []);
  for (const c of g.track) {
    const [i, j, h] = c;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => own.get((i + dx) + ',' + (j + dy)) !== h)) out[h].push(c);
  }
  g.rim = out;
  return out;
}

/** A first tick's petal is this share of the full petal's size. */
export const BUD = .2;
/** How large petal h is drawn at `growth` (0 to 1): the whole petal shape
 *  scaled from its base, BUD at one tick and 1 when full. Below one tick (a
 *  tick easing in or out) it shrinks on to nothing, so the change is smooth. */
export function petalScale(growth) {
  if (!(growth > 0)) return 0;
  const one = 1 / FILL, at = u => BUD + (1 - BUD) * u;
  return growth < one ? at(one) * growth / one : at(Math.min(1, growth));
}

/** The filled part of petal h at `growth` (0 to 1): the cells inside the petal
 *  shape scaled to petalScale(growth) from its base (a cell's Sx is the
 *  smallest such petal it sits inside). A young petal is a small whole petal
 *  with its rounded tip, never a straight cut across; at growth 1 it is the
 *  whole petal. Growth 0 fills nothing; the petal's outline (goal()) is there
 *  all the same. */
export function drawn(g, h, growth) {
  const cells = g.bySx[h] || [], s = petalScale(growth);
  if (!(s > 0)) return [];
  if (s >= 1) return cells;
  let lo = 0, hi = cells.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cells[mid][3] <= s) lo = mid + 1; else hi = mid; }
  return cells.slice(0, lo);
}

/** The bush stage each bush layer (a g.deco cell's li) belongs to: the back
 *  row 1, the outer ring 2, the extra petals 4. The vines are stage 3 and the
 *  dust of full bloom stage 5 (STAGES in lib/dash/flower-rules.js). */
export const LAYER_STAGE = [1, 2, 4], VINES_STAGE = 3, BLOOM_STAGE = 5;

/** The bush cells filled at bush stage `bush`: every stage the flower has
 *  reached by upgrades, whole, whatever the petals' growth, and nothing of a
 *  stage it has not reached. Before the reveal nothing of the bush is drawn. */
export function bushFill(g, bush, revealed = true) {
  if (!revealed) return { deco: [], vines: [], dust: [] };
  return { deco: g.deco.filter(c => bush >= LAYER_STAGE[c[6]]), vines: bush >= VINES_STAGE ? g.vines : [], dust: bush >= BLOOM_STAGE ? g.dust : [] };
}

/** The goal outline's alphas in the theme's --mute tone: each shape's rim, and
 *  the dotted fill inside it (every other cell). */
export const GOAL_RIM = .35, GOAL_FILL = .1;

/** The goal: the whole flower at full bloom as a faint outline, the same
 *  whatever is ticked and whatever the bush stage (what is drawn of it is
 *  outline(g, revealed)). One entry [i, j, alpha,
 *  side] per cell of every petal at full size, every bush layer's full shape
 *  (not only its dithered cells), the vines and the dust; alpha is GOAL_RIM on
 *  a shape's rim, GOAL_FILL on the checkerboard of cells inside it and 0 on
 *  the rest (left bare so the inside reads dotted); side is the square's side
 *  in cells. A petal's rim is rim(g); a bush shape's rim is its cells with a
 *  4-neighbour that is empty or belongs to a shape further back, so where it
 *  meets a petal or a nearer bush layer only the nearer shape draws the line.
 *  Built once per geometry. Flower.jsx draws it under everything. */
export function goal(g) {
  if (g.goal) return g.goal;
  const out = [], key = (i, j) => i + ',' + j, dot = (i, j) => (i + j) % 2 ? 0 : GOAL_FILL;
  const rims = rim(g).map(cells => new Set(cells.map(c => key(c[0], c[1]))));
  for (const [i, j, h] of g.track) out.push(rims[h].has(key(i, j)) ? [i, j, GOAL_RIM, .82] : [i, j, dot(i, j), .5]);
  /* nearer first: the petals, their seams and the eye, then the bush layers in the order they own cells */
  const rank = new Map();
  for (const c of [...g.track, ...g.seam, ...g.eye]) rank.set(key(c[0], c[1]), 0);
  for (const [i, j, li, k] of g.shape) rank.set(key(i, j), 1 + li * 100 + k);
  for (const [i, j] of g.shape) {
    const own = rank.get(key(i, j));
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const r = rank.get(key(i + dx, j + dy)); return r === undefined || r > own; });
    out.push(edge ? [i, j, GOAL_RIM, .62] : [i, j, dot(i, j), .5]);
  }
  for (const [i, j] of g.vines) out.push([i, j, GOAL_RIM, .5]);
  for (const [i, j] of g.dust) out.push([i, j, GOAL_RIM, .3]);
  g.goal = out;
  return out;
}

/** The goal split in two: `petals`, every petal at full size (its first
 *  g.track.length entries), and `bush`, every bush stage (the rest). Built
 *  once per geometry. */
export function goalParts(g) {
  if (!g.goalParts) { const all = goal(g); g.goalParts = { petals: all.slice(0, g.track.length), bush: all.slice(g.track.length) }; }
  return g.goalParts;
}

/** The outline drawn: before the reveal only the petals, after it the petals
 *  and every bush stage behind them. */
export const outline = (g, revealed) => revealed ? goal(g) : goalParts(g).petals;

/** How bright a petal is drawn for its regrowth: 1 for a living petal, and
 *  for one regrowing after death from .3 (the day it died) up to 1 over HEAL
 *  days. How much of the petal is drawn is its growth (drawn()), not this. */
export const regrowLight = pe => pe.grow < 1 ? .3 + .7 * Math.max(0, pe.grow) : 1;

export const crackAt = (cell, open) => { let r = 0; for (const k of cell[6]) r = Math.max(r, open.get(k) || 0); return r; };
export const crumbled = (w, i, j, edge) => edge && w > .35 && B4[j % 4][i % 4] < (w - .35) * 1.6;
export const wither = (c, m) => { const g = (c[0] + c[1] + c[2]) / 3; return mix(c, [g * .62 + 28, g * .5 + 16, g * .28 + 6], Math.min(.85, m * 1.8)); };
/** Where petal k's icon sits: just past its tip, in grid units. */
export const tipAt = (k, H) => { const a = (k * 360 / H + 2 * Math.sin(k * 2.3)) * D2R, r = (.1 + (1 + .04 * Math.cos(k * 1.7 + 1))) * SC + 5.5; return [G / 2 + Math.sin(a) * r, G / 2 - Math.cos(a) * r]; };

/** The extent of the full goal outline, in grid units [top, bottom, left,
 *  right]: every cell of goal(g), bush stages included, by the half side of
 *  its square, and the eye. It takes no growth, no bush stage and no reveal on
 *  purpose: Flower.jsx centres the flower on this box, so the flower never
 *  moves as its petals grow, at the reveal or as its bush fills in (whatever
 *  is drawn lies inside it). */
export function extent(g) {
  if (g.extent) return g.extent;
  let top = G, bottom = 0, left = G, right = 0;
  const add = (i, j, half) => {
    top = Math.min(top, j + .5 - half); bottom = Math.max(bottom, j + .5 + half);
    left = Math.min(left, i + .5 - half); right = Math.max(right, i + .5 + half);
  };
  for (const [i, j, , side] of goal(g)) add(i, j, side / 2);
  for (const c of g.eye) add(c[0], c[1], .3);
  g.extent = [Math.max(0, top), Math.min(G, bottom), Math.max(0, left), Math.min(G, right)];
  return g.extent;
}

/** The misses of the last HEAL days for one petal, replayed from its history
 *  (oldest first, today last). Each miss opens a crack chosen by the absolute
 *  day, so a crack stays put as the days move on; DEATH open cracks kill the
 *  petal and it comes back over HEAL days. Today does not count until it is
 *  over, and days before the habit's tracked history starts (index < since)
 *  are not misses. grow (0 to 1) is how far a dead petal has come back, which
 *  only dims it (regrowLight); how much of the petal is drawn is its growth
 *  (growthOf in lib/dash/flower-rules.js). A habit with no tracked history
 *  (since null: never ticked, or resting after DORMANT days without a tick)
 *  is a blank petal: no cracks, no wear, and nothing filled, only its outline. */
export function petal(history, since, h, abs0) {
  if (since === null || since === undefined) return { open: new Map(), wear: 0, grow: 1, cracks: 0, blank: true };
  let cracks = [], born = -Infinity;
  for (let i = 0; i < DAYS - 1; i++) {
    if (i >= since && !history[i]) { const used = cracks.map(c => c.k), a = abs0 + i; let k = (a * 7 + h * 13) % CRACKS; while (used.includes(k)) k = (k + 5) % CRACKS; cracks.push({ day: i, k }); }
    cracks = cracks.filter(c => i - c.day < HEAL);
    if (cracks.length >= DEATH) { cracks = []; born = i + 1; }
  }
  const open = new Map(); let w = 0; for (const c of cracks) { const o = 1 - (DAYS - 2 - c.day) / HEAL; open.set(c.k, Math.max(open.get(c.k) || 0, o)); w += o; }
  return { open, wear: Math.min(1, w / DEATH), grow: Math.min(1, (DAYS - 1 - born + 1) / HEAL), cracks: cracks.length, blank: false };
}

export { STYLES };
