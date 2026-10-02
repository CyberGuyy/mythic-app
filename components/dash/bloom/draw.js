// The habit flower drawn to a canvas. Every cell is a solid square on the flower's 88-cell grid, or
// it is gone: nothing is laid over a petal.
//
// A petal is the whole petal shape grown from its base (petalScale). A missed
// day tears a rip in from the tip or a side whose edge dries; misses in a row
// tear it deeper, brown it from the tear and then along the petal's edge,
// until on the fifth it is a dead husk. Coming back, the tear closes from its
// inner end and paler new growth fills it. When a dead petal starts again its
// husk withers away from the tip behind the new one (petal.fall). A new colour
// grows out from the middle of each petal (petal.from, petal.grow). The
// thriving rewards (glow, pollen, dew, sunlight), the colour's bush, aurora,
// insect and world come in through fx and the under/over hooks
// (./scenery.js). The rules live in lib/dash/bloom-rules.js.
import { geometry, goalParts, bushFill, petalScale, ramp, mul, mix, css, ss, B4, G, SC } from '../flower-geo.js';
import { STYLES } from '@/lib/dash/flower-rules.js';
import { KILL, rng, runsOf } from '@/lib/dash/bloom-rules.js';

export const H = 5;
export const g = geometry(H);
export const MUTE = [120, 116, 108];

const D2R = Math.PI / 180, WIDTH = .33;
const profRaw = t => Math.pow(Math.sin(Math.PI * Math.pow(t, 1.3)), .62);
let pm = 0; for (let i = 1; i < 200; i++) pm = Math.max(pm, profRaw(i / 200));
const prof = t => profRaw(Math.min(.9999, Math.max(1e-4, t))) / pm;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const grey = c => { const v = (c[0] + c[1] + c[2]) / 3; return [v, v, v]; };
const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/* smooth value noise: lobes and wavy fronts, never single-pixel speckle */
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, sm = w => w * w * (3 - 2 * w), a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  const U = sm(u), V = sm(v); return a + (b - a) * U + (c - a) * V + (a - b - c + d) * U * V;
}

/* petal k's frame, as flower-geo.js's track layer lays it out */
const frames = Array.from({ length: H }, (_, k) => {
  const a = (k * 360 / H + 2 * Math.sin(k * 2.3)) * D2R;
  return { ux: Math.sin(a), uy: -Math.cos(a), L: SC * (1 + .04 * Math.cos(k * 1.7 + 1)) };
});
/** A point of the grown petal, in its own terms (tp along 0..1, qp across -1..1), to grid cells. */
export function toCell(k, s, tp, qp) {
  const f = frames[k], along = .1 * SC + tp * s * f.L, across = qp * WIDTH * SC * s * prof(tp);
  return [along * f.ux - across * f.uy + G / 2 - .5, along * f.uy + across * f.ux + G / 2 - .5];
}

/* where a first rip starts: the tip, or high or low on one side */
const SIDES = { lefthigh: [.72, -1], righthigh: [.72, 1], leftlow: [.5, -1], rightlow: [.5, 1] };
const chipAt = (pattern, seed) => { const v = rng(seed)(); if (pattern === 'tip') return { tp: 1.01, qp: (v - .5) * .3 }; const [tc, s] = SIDES[pattern]; return { tp: tc + (v - .5) * .1, qp: s * 1.02 }; };
const OPPOSITE = { lefthigh: 'righthigh', righthigh: 'lefthigh', leftlow: 'rightlow', rightlow: 'leftlow', tip: 'leftlow' };

/* per day in a row (fractional while a miss lands): the tear's depth and mouth in cells, the second
   and third tears, how far the brown reaches from the tears and from the edge, and how far along the edge */
const TEAR_LEN = [0, 6.5, 9.5, 12, 14], TEAR_W = [0, 2.3, 2.7, 3, 3.3], TEAR2_LEN = [0, 0, 0, 5, 8], TEAR3_LEN = [0, 0, 0, 0, 6];
const ROT_TEAR = [0, 0, 1.6, 3.3, 4.2], ROT_EDGE = [0, 0, 1, 4.6, 7], EDGE_REACH = [0, 0, 7, 23, 40];
const lerpAt = (arr, x) => { const a = Math.max(0, Math.floor(x)), f = x - a, lo = arr[Math.min(arr.length - 1, a)], hi = arr[Math.min(arr.length - 1, a + 1)]; return lo + (hi - lo) * f; };
/** the rot's palette: flat, muted browns */
export const ROT = { rim: [124, 98, 84], tan: [118, 92, 76], brown: [84, 60, 50], husk: [96, 76, 64], huskLight: [118, 96, 80], huskEdge: [66, 50, 44] };
/* the soaked band ahead of the brown: the petal's own colour gone dark */
const soaked = c => mix(mul(c, .58), [60, 46, 42], .25);

/* a tear in grid cells: a jagged line from just outside the edge in toward the base */
function tearOf(k, s, o, L, seed) {
  const h = chipAt(o.pattern, o.seed), tipT = o.pattern === 'tip', side = Math.sign(h.qp) || 1;
  const t0 = tipT ? 1.06 : clamp(h.tp, .42, .8), q0 = tipT ? clamp(h.qp, -.22, .22) : side * 1.12;
  const A = toCell(k, s, t0, q0), B = tipT ? toCell(k, s, .2, q0 * .3) : toCell(k, s, t0 - .32, -side * .15);
  const l = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, ux = (B[0] - A[0]) / l, uy = (B[1] - A[1]) / l, r = rng(seed * 7 + 3);
  const Lt = L * Math.sqrt(Math.max(.2, s)) + 1.2, N = Math.max(2, Math.ceil(Lt / 2.2)), P = [A];
  for (let n = 1; n <= N; n++) { const v = n / N * Lt, jt = (r() - .5) * 1.5; P.push([A[0] + ux * v - uy * jt, A[1] + uy * v + ux * jt]); }
  return { P, L: Lt, A };
}
/* signed distance from a polyline (which side it lies on) and how far along it, in cells */
function onLine(P, x, y) {
  let best = { d: 1e9, a: 0 }, run = 0;
  for (let n = 0; n < P.length - 1; n++) {
    const [ax, ay] = P[n], [bx, by] = P[n + 1], l = Math.hypot(bx - ax, by - ay) || 1e-6, v = clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (l * l));
    const d = Math.hypot(x - ax - (bx - ax) * v, y - ay - (by - ay) * v);
    if (d < Math.abs(best.d)) best = { d: (bx - ax) * (y - ay) - (by - ay) * (x - ax) < 0 ? -d : d, a: run + v * l };
    run += l;
  }
  return best;
}

/* One petal's rot from its runs of misses: per cell whether it is torn away
   now (goneNow) or was at worst (gonePeak), how deep in the rot it sits now
   and at worst (dNow, dPeak), whether it is on a torn edge, and, dead, how far
   from the petal's edge. The same inputs give the same rot, so it is kept. */
const rotCache = new Map();
function rotOf(k, s, cellsTP, open) {
  const key = k + '|' + s.toFixed(4) + '|' + open.map(m => [m.origin?.seed ?? m.seed, m.run, m.age, Number(m.back) || 0, (m.intro ?? 1).toFixed(3)].join(':')).join(',');
  const hit = rotCache.get(key); if (hit) return hit;
  const tears = [], edgeSrc = [];
  let dead = 0, worst = 0, heal = 1, level = 0;
  for (const run of runsOf(open)) {
    const lastM = run.list.reduce((a, m) => ((m.run || 1) > (a.run || 1) ? m : a), run.list[0]), intro = Math.min(1, lastM.intro ?? 1);
    const o = lastM.origin && SIDES[lastM.origin.pattern] || lastM.origin?.pattern === 'tip' ? lastM.origin : { pattern: 'righthigh', seed: lastM.seed };
    if (run.len >= KILL) dead = Math.max(dead, intro);
    const lenF = Math.min(4, run.len >= KILL ? 4 : run.len - 1 + intro), u = run.len >= KILL ? 0 : run.u;
    worst = Math.max(worst, lenF * (1 - u)); heal = Math.min(heal, u); level = Math.max(level, lenF);
    const close = clamp(u * 1.45), shrink = Math.pow(1 - u, 1.3);   // the tear closes well before the colour is fully back
    const add = (oo, L, W, rot, seed) => { if (L <= .2) return; tears.push({ ...tearOf(k, s, oo, L, seed), W, close, rot, shrink, seed }); };
    add(o, lerpAt(TEAR_LEN, lenF), lerpAt(TEAR_W, lenF), lerpAt(ROT_TEAR, lenF), o.seed);
    add({ pattern: OPPOSITE[o.pattern], seed: o.seed + 101 }, lerpAt(TEAR2_LEN, lenF), 1.8, lerpAt(ROT_TEAR, lenF) * .7, o.seed + 101);
    add({ pattern: o.pattern === 'tip' ? 'rightlow' : 'tip', seed: o.seed + 211 }, lerpAt(TEAR3_LEN, lenF), 1.6, lerpAt(ROT_TEAR, lenF) * .6, o.seed + 211);
    const re = lerpAt(ROT_EDGE, lenF);
    if (re > 0) edgeSrc.push({ A: tears[tears.length - (lenF > 3 ? 3 : lenF > 2 ? 2 : 1)]?.A, R: re, reach: lerpAt(EDGE_REACH, lenF), shrink });
  }
  const out = new Map(), result = { out, dead, worst, heal, level };
  if (tears.length || dead) {
    const keys = new Set(cellsTP.map(c => c.key)), edges = cellsTP.filter(c => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !keys.has((c.i + dx) + ',' + (c.j + dy))));
    /* the edge cells the brown creeps along: nearest the tears first */
    const edgeR = [];
    for (const src of edgeSrc) for (const e of edges) {
      const dm = src.A ? Math.hypot(e.i - src.A[0], e.j - src.A[1]) : 0, R = src.R * clamp(1 - dm / src.reach);
      if (R > 0) edgeR.push({ i: e.i, j: e.j, R, shrink: src.shrink });
    }
    for (const c of cellsTP) {
      let goneNow = false, gonePeak = false, dNow = -9, dPeak = -9, rNow = 0, rPeak = 0;
      for (const t of tears) {
        const { d, a } = onLine(t.P, c.i, c.j), hw = t.W * Math.pow(clamp(1 - a / t.L), .8);
        const jag = (vnoise(a * .9, d < 0 ? 3 : 9, t.seed) - .5) * 1.4, wNow = Math.pow(1 - t.close, .6);
        if (a < t.L && Math.abs(d) < hw + jag && hw + jag > .5) { gonePeak = true; if (a < t.L * (1 - t.close) && Math.abs(d) < (hw + jag) * wNow) goneNow = true; }
        const off = Math.max(0, Math.abs(d) - hw), reach = t.rot * (1 - .35 * a / t.L);
        dPeak = Math.max(dPeak, reach - off); dNow = Math.max(dNow, reach * t.shrink - off); rPeak = Math.max(rPeak, reach); rNow = Math.max(rNow, reach * t.shrink);
      }
      for (const e of edgeR) { const dd = Math.hypot(c.i - e.i, c.j - e.j); dPeak = Math.max(dPeak, e.R - dd); dNow = Math.max(dNow, e.R * e.shrink - dd); rPeak = Math.max(rPeak, e.R); rNow = Math.max(rNow, e.R * e.shrink); }
      const wob = (vnoise(c.i * .38, c.j * .38, k + 5) - .5) * 1.8;   // a wavy front, only where there is rot to shape
      dPeak += wob * clamp(dPeak + 2) * clamp(rPeak); dNow += wob * clamp(dNow + 2) * clamp(rNow);
      if (dead) dNow += dead * 24;   // dying: the brown runs out over the whole petal from the damage
      out.set(c.key, { goneNow, gonePeak, dNow, dPeak, edge: 0 });
    }
    for (const c of cellsTP) {
      const v = out.get(c.key); if (v.goneNow) continue;
      v.rim = [[0, -1], [-1, 0], [-1, -1], [0, 1], [1, 0], [1, 1], [1, -1], [-1, 1]].some(([dx, dy]) => out.get((c.i + dx) + ',' + (c.j + dy))?.goneNow);
      if (dead) v.edge = Math.min(3, ...edges.map(e => Math.hypot(c.i - e.i, c.j - e.j)));
    }
  }
  if (rotCache.size > 200) rotCache.clear();
  rotCache.set(key, result);
  return result;
}

/* the colour of one rotting cell, or null when untouched */
function rotColour(v, dead, col, st, c, k, u, form, level) {
  const flat = x => mul(x, .94 + .06 * form);   // the rot barely follows the petal's light
  if (dead) {
    /* a dried petal: mottled brown, darker and curled at the edge, its veins showing */
    let h = mix(ROT.huskEdge, mix(ROT.husk, ROT.huskLight, clamp(vnoise(c.i * .3, c.j * .3, k + 13) * 1.6 - .3)), clamp(v.edge / 2));
    const aq = Math.abs(c.qn);
    if ((aq < .06 || Math.abs(aq - .55 * c.tp) < .05) && c.tp > .08 && c.tp < .92) h = mul(h, .8);
    return flat(v.rim ? ROT.huskEdge : h);
  }
  if (v.rim) return mix(mul(col, .62), flat(ROT.rim), clamp(.5 + .25 * (level - 1)));   // the torn edge dries, one flat dull colour
  const d = v.dNow;
  if (d > 2.3) return flat(ROT.tan);   // dead and dry nearest the damage
  if (d > 1.05) return flat(ROT.brown);   // the rotting front
  if (d > 0 && u < .35) return soaked(col);   // ahead of the brown while it spreads; gone once you are back
  if (v.gonePeak) return mix(col, mix(ramp(st, .98), [255, 250, 240], .4), .6 * Math.pow(1 - u, .6));   // regrown: paler new growth for a few days
  return null;
}

/** Draw the flower to a canvas.
 *  petals[k] = { growth, misses (stateAt's, each with an optional intro 0..1 as
 *  it lands), tier, from (the colour before, while a new one grows in), grow
 *  (how far the new colour has grown, 0..1), fall (0..1, the old husk
 *  withering after a restart), pulse (0..1, a tick's light running base to
 *  tip) }, null for no habit.
 *  fx: { time, glow (thriving level), glowIn, burst (0..1), pollen, dew, sun,
 *  aurora, bush (the colour's bush stage), bushTier }.
 *  box: the grid area to fit, [i0, j0, i1, j1]. under/over(api) draw the world
 *  and the insect; api.sq(i, j, side, colour) paints a cell. env adds to api
 *  what the worlds read: dayFrac (the time of day, 0 at 6am) and stars (thriving days). */
export function draw(cv, petals, { box = null, eye = true, fx = null, under = null, over = null, hurt: hurtIn = null, mute = MUTE, env = null } = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return null;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const [i0, j0, i1, j1] = box || [0, 0, G, G], cf = Math.min(w / (i1 - i0), h / (j1 - j0));
  const ox = (w - cf * (i1 - i0)) / 2 - i0 * cf, oy = (h - cf * (j1 - j0)) / 2 - j0 * cf;
  const sq = (i, j, side, col) => { ctx.fillStyle = css(col); const s = cf * side; ctx.fillRect(ox + (i + .5) * cf - s / 2, oy + (j + .5) * cf - s / 2, s, s); };
  /* a day with all five missed: the rot reaches into every petal's base from the heart and pulls back as it heals */
  let hurt = hurtIn;
  if (!hurt && petals.length >= H && petals.every(p => p)) {
    let heart = 0;
    for (const m0 of petals[0].misses || []) {
      if (m0.day === undefined || m0.age < 1 || m0.age > 7) continue;
      if (petals.every(p => (p.misses || []).some(m => m.day === m0.day))) heart = Math.max(heart, (1 - clamp((m0.age - 1 + (Number(m0.back) || 0)) / 6)) * Math.min(1, m0.intro ?? 1));
    }
    if (heart > 0) hurt = { heart };
  }
  const T = fx?.time || 0, tierN = petals.find(p => p)?.tier || 0, tierSt = STYLES[tierN][1], L = fx?.glow || 0, gin = fx?.glowIn ?? 1;
  const api = { ctx, w, h, cf, ox, oy, cx: ox + G / 2 * cf, cy: oy + G / 2 * cf, sq, T, tier: tierN, st: tierSt, next: STYLES[Math.min(tierN + 1, STYLES.length - 1)][1], ...env };
  if (under) under(api);

  /* how rich the effects are: subtle on the first colour, deeper gradients on every colour after it */
  const rich = tierN / (STYLES.length - 1), nextSt = STYLES[Math.min(tierN + 1, STYLES.length - 1)][1];
  if (L) {
    /* the thriving glow: a dithered pixel aura around the flower, wider and denser with every thriving day */
    const inner = .3 * SC, outer = (1.18 + .08 * Math.min(L, 8)) * SC, strength = Math.min(1, .5 + .09 * L) * gin;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const d = Math.hypot(i + .5 - G / 2, j + .5 - G / 2); if (d < inner || d > outer) continue;
      const f = 1 - (d - inner) / (outer - inner), shimmer = .8 + .2 * Math.sin(T * 2.2 - d * .45 + Math.atan2(j - G / 2, i - G / 2) * 3);
      if (B4[j % 4][i % 4] >= strength * f * f * shimmer * 1.25) continue;
      ctx.globalAlpha = .7 * f; sq(i, j, .5, mix(tierSt[1], tierSt[3], f)); ctx.globalAlpha = 1;
    }
  }
  if (fx?.bush) {
    /* the colour's bush, every stage reached grown in behind the petals */
    const bst = STYLES[fx.bushTier ?? tierN][1], fill = bushFill(g, fx.bush, true);
    for (const [i, j, t, q, , gain, li] of fill.deco) {
      let c = mul(ramp(bst, .1 + .9 * t), (li === 0 ? .38 : .33) + gain * .95 + (fx.aurora ? .05 * Math.sin(T * 1.4 + t * 5) : 0));
      if (rich) c = mix(c, mul(ramp(nextSt, .1 + .9 * t), (li === 0 ? .26 : .22) + gain * .75), rich * .5 * (.5 + .5 * Math.sin(t * 4 + li)));
      sq(i, j, .86 * (.52 - .12 * q), mix(c, grey(c), .22 * (1 - rich)));
    }
    for (const [i, j] of fill.vines) sq(i, j, .5, mix(mul(ramp(bst, .3), .5 + .2 * rich), grey(bst[1]), .25 * (1 - rich)));
    for (const [i, j] of fill.dust) sq(i, j, .3, mul(mix(bst[2], nextSt[2], rich * .5), .4 + .25 * Math.sin(T * 3 + i)));
  }

  /* the goal: every petal at full size, faint, for what is filled to cover */
  const outline = goalParts(g).petals;
  ctx.fillStyle = css(mute);
  for (const [i, j, a, side] of outline) { if (!a) continue; ctx.globalAlpha = a; ctx.fillRect(ox + (i + .5) * cf - cf * side / 2, oy + (j + .5) * cf - cf * side / 2, cf * side, cf * side); }
  ctx.globalAlpha = 1;

  /* a dead petal cleared by the tick that restarts it: behind the new petal, the husk withers away
     from its tip to its base. Each piece darkens, shrinks and sinks, then crumbles off and drops. Nothing fades. */
  for (let k = 0; k < H; k++) {
    const p = petals[k];
    if (!p || p.fall === undefined || p.fall === null || p.fall >= 1) continue;
    const f = clamp(p.fall);
    for (const c of g.track) {
      if (c[2] !== k) continue;
      const [i, j, , Sx] = c, hh = hash(i, j, k + 61), go = .06 + .68 * (1 - Sx) + .16 * vnoise(i * .45, j * .45, k + 71) + .04 * hh;   // the tip first, the base last
      const dry = mix(ROT.huskEdge, mix(ROT.husk, ROT.huskLight, vnoise(i * .3, j * .3, k + 13)), .4 + .6 * (1 - Sx));
      const wi = clamp((f - go + .16) / .16);   // withering, just before it goes
      if (f < go) { sq(i, j + wi * wi * 1.2 * Sx, .78 - .22 * wi, mix(dry, ROT.huskEdge, wi * .6)); continue; }
      const dt = f - go;   // gone: a few crumbs drop for a moment
      if (hh < .35 && dt < .22) sq(i + (hh - .17) * 8 * dt, j + 1 + dt * dt * 240, .38, ROT.husk);
    }
  }

  /* the thriving effects on one petal cell's colour */
  const fxCol = (col, i, j, r, k, st, edge) => {
    if (fx?.aurora) {
      /* one pale band of the flower's own colour sweeping out through each petal in turn, and the rims lighting in sequence */
      const wv = Math.max(0, Math.sin(T * 1.1 - r * 4.5 - k * 1.26));
      let band = mix(ramp(st, clamp(1.35 - r)), [255, 250, 245], .3);
      if (rich) band = mix(band, ramp(nextSt, 1 - r), rich * .55);
      col = mix(col, band, wv * wv * (.55 + .15 * rich));
      if (edge) col = mix(col, [255, 250, 240], .08 + .28 * Math.max(0, Math.sin(T * 2.4 - k * 1.26)));
    }
    if (fx?.glow) col = mix(col, [255, 248, 238], (edge ? .14 + .08 * Math.sin(T * 2 + k) : .05) * gin);
    if (fx?.sun) {
      /* a slow diagonal glint of light across the whole flower every few seconds */
      const d = (i + j) / (2 * G) - (((T % 7) / 7) * 1.6 - .3);
      if (Math.abs(d) < .035) col = mix(col, [255, 252, 245], .28 * (1 - Math.abs(d) / .035));
    }
    if (fx?.burst) { const d = Math.abs(r - (fx.burst * 1.3 - .15)); if (d < .15) col = mix(col, [255, 250, 235], (1 - d / .15) * .85); }
    return col;
  };

  let flowerDim = 0;
  const drawn = [], dews = [];
  for (let k = 0; k < H; k++) {
    const p = petals[k]; if (!p) continue;
    const cells = g.byT[k], st = STYLES[p.tier || 0][1];
    /* each miss heals with its run; a dead run stays until the next tick clears it */
    const open = [];
    for (const run of runsOf((p.misses || []).filter(m => m.age >= 1 && (m.intro ?? 1) > 0))) {
      if (run.len >= KILL) { for (const m of run.list) open.push(m); continue; }
      if (run.u < 1) for (const m of run.list) open.push(m);
    }
    const dying = runsOf(open).some(run => run.len >= KILL);
    const s = petalScale(dying ? 1 : p.growth);
    if (!(s > 0)) continue;
    const cellsTP = [];
    for (const c of cells) { const [i, j, , Sx, t, q] = c; if (Sx > s) continue; const tp = t / s; cellsTP.push({ c, i, j, key: i + ',' + j, tp, qn: q * prof(t) / Math.max(1e-3, s * prof(tp)) }); }
    const rot = rotOf(k, s, cellsTP, open);
    flowerDim = Math.max(flowerDim, rot.dead * .3);
    drawn.push({ k, p, st, s, cellsTP, rot, clean: !open.length });
  }

  if (eye) {
    const any = petals.some(p => p && p.growth > 0);
    for (const [i, j, r] of g.eye) if (B4[j % 4][i % 4] < .55) {
      if (any) sq(i, j, .3 + .3 * (1 - r), mix(mix(mix(tierSt[3], [255, 255, 255], .3), mute, flowerDim * .8), ROT.tan, .75 * (hurt?.heart || 0)));
      else { ctx.globalAlpha = .3; sq(i, j, .3 + .3 * (1 - r), mute); ctx.globalAlpha = 1; }
    }
  }

  for (const { k, p, st, s, cellsTP, rot, clean } of drawn) {
    if (fx?.dew && clean && s >= .8) {
      /* three dew drops per clean petal, always in the same places */
      cellsTP.filter(c => c.tp > .3 && c.tp < .8 && Math.abs(c.qn) < .6).sort((a, b) => hash(a.i, a.j, 41) - hash(b.i, b.j, 41)).slice(0, 3)
        .forEach(c => dews.push([c.i, c.j, ramp(st, 1 - c.c[3] / s)]));
    }
    /* a new colour growing out from the middle: inside its front the new colour, outside it the one before */
    const before = p.from !== undefined && p.from !== null && p.from !== p.tier ? STYLES[p.from][1] : null, front = before ? petalScale(clamp(p.grow || 0)) : 1;
    for (const cellTP of cellsTP) {
      const { c, i, j, key } = cellTP;
      const [, , , Sx, t, q] = c, r = Sx / s, edge = Math.abs(q) > .86 || r > .93;
      const v = rot.out.get(key), size = edge ? .7 : .82;
      if (v?.goneNow) continue;
      if (rot.dead && v && v.dNow > 0 && v.edge < .5 && vnoise(i * .5, j * .5, k + 31) < .3 * rot.dead) continue;   // the husk's dry edge curls away
      const inNew = Sx <= front, sd = inNew ? st : before;
      let col = mul(ramp(sd, 1 - r), (q < 0 ? 1 : .82) * (.7 + .3 * ss(0, .3, t)));
      if (before) { const lip = clamp(1 - Math.abs(Sx - front) * 14); if (lip > 0) col = mix(col, mix(ramp(st, .9), [255, 250, 240], .25), lip * .5); }   // the lip of the new colour glows
      if (rot.worst > 2) col = mul(mix(col, grey(col), .22 * (rot.worst - 2)), 1 - .1 * (rot.worst - 2));   // from the third day in a row what is left alive dulls
      if (hurt?.heart) {
        /* all five missed: the rot reaches into every petal from the heart */
        const hd = (.08 + .22 * hurt.heart - r) * SC * s + (vnoise(i * .4, j * .4, k + 7) - .5) * 2.2, lt = .94 + .06 * (q < 0 ? 1 : .82);
        if (hd > 0) { sq(i, j, size, hd > 3 ? mul(ROT.tan, lt) : hd > 1.3 ? mul(ROT.brown, lt) : soaked(col)); continue; }
      }
      col = fxCol(col, i, j, r, k, st, edge);
      if (p.pulse > 0 && p.pulse < 1) { const d = (p.pulse * 1.3 - .15) - r; if (d >= 0 && d < .3) col = mix(col, [255, 250, 240], (1 - d / .3) * .55); }   // a tick's light running from the base to the tip
      const form = (q < 0 ? 1 : .82) * (.7 + .3 * ss(0, .3, t));
      const rc = v && (rot.dead && v.dNow > 0 ? rotColour(v, true, col, st, cellTP, k, 0, form, 4) : rotColour(v, false, col, st, cellTP, k, rot.heal, form, rot.level));
      sq(i, j, size, rc || col);
    }
  }

  if (fx) {
    const c0 = G / 2 - .5;
    if (L) {
      /* sparks drifting out from the flower, more with every thriving day */
      const N = Math.round((3 + 2 * Math.min(L, 6)) * gin);
      for (let n = 0; n < N; n++) {
        const a = n * 2.39996, ph = hash(n, 3, 17), u = (T * (.16 + .1 * hash(n, 5, 9)) + ph) % 1, R = SC * (.75 + u * .75);
        ctx.globalAlpha = (1 - u) * .6; sq(Math.round(c0 + Math.cos(a) * R), Math.round(c0 + Math.sin(a) * R), .45, mix(tierSt[3], [255, 255, 255], .45)); ctx.globalAlpha = 1;
      }
    }
    if (fx.pollen) {
      /* a few faint motes drifting slowly up past the flower */
      for (let n = 0; n < 9; n++) {
        const life = (T * (.045 + .03 * hash(n, 8, 2)) + hash(n, 9, 3)) % 1, a = Math.sin(life * Math.PI);
        const x = Math.round(c0 + (hash(n, 7, 1) - .5) * 2.3 * SC + Math.sin(T * .6 + n * 2) * 2.2), y = Math.round(c0 + 1.2 * SC - life * 2.4 * SC);
        ctx.globalAlpha = a * .55; sq(x, y, .5, mix(mix(tierSt[3], [255, 255, 255], .5), nextSt[3], n % 2 ? rich * .5 : 0));
      }
      ctx.globalAlpha = 1;
    }
    if (fx.dew) {
      /* dew drops resting on the petals; one at a time catches the light */
      const cyc = 1.6, which = Math.floor(T / cyc), ph = (T % cyc) / cyc;
      dews.forEach(([i, j, base], n) => {
        const glint = n === which % dews.length ? Math.sin(ph * Math.PI) : 0;
        sq(i, j + 1, .6, mul(base, .55));
        sq(i, j, .72, mix(mix(base, [255, 255, 255], .55), [255, 255, 255], glint * .45));
        if (glint > .25) { ctx.globalAlpha = (glint - .25) * .9; for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) sq(i + dx, j + dy, .32, [255, 255, 255]); ctx.globalAlpha = 1; }
      });
    }
    if (fx.burst && fx.burst < 1) {
      /* the moment something new arrives: a ring of light running out from the middle */
      const R = fx.burst * 1.5 * SC;
      for (let d = 0; d < 72; d++) { const a = d / 72 * 2 * Math.PI; ctx.globalAlpha = 1 - fx.burst; sq(Math.round(c0 + Math.cos(a) * R), Math.round(c0 + Math.sin(a) * R), .6, [255, 250, 235]); }
      ctx.globalAlpha = 1;
    }
  }
  if (over) over(api);
  return api;
}

