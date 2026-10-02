// Worlds behind the flower and the insect each colour unlocks, all drawn on
// the flower's own pixel grid: one cell is one pixel, gradients are dithered
// with the same Bayer matrix, and nothing is smooth. Each world is { name,
// say, under(api), over(api) }; each insect is { tier, name, say, over(api) },
// drawn through draw()'s under/over hooks in ./draw.js. api.sq(i, j, side,
// colour) paints grid cell (i, j); api.T is the time in seconds and api.st the
// flower's colour stops.
import { toCell, H } from './draw.js';
import { SC, G, mix, B4 } from '../flower-geo.js';

const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = u => 1 - (1 - clamp(u)) ** 3;
const lerpC = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
const c0 = G / 2 - .5;
const dim = (c, f) => c.map(v => v * f);

/* a colour from palette P at v (0..1), dithered between its two nearest steps */
const pal = (P, v, i, j) => { const x = clamp(v) * (P.length - 1), lo = Math.floor(x); return P[Math.min(P.length - 1, lo + (B4[j & 3][i & 3] < x - lo ? 1 : 0))]; };
/* paint every cell of the grid from fn(i, j) (null leaves it empty) */
function fill(api, fn) { for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const c = fn(i, j); if (c) api.sq(i, j, 1, c); } }
const alpha = (api, a, draw) => { api.ctx.globalAlpha = a; draw(); api.ctx.globalAlpha = 1; };

/* twinkling one-pixel stars, some with a small cross */
function stars(api, n, seed, strength = 1, keep = () => true) {
  const { T } = api;
  for (let s = 0; s < n; s++) {
    const i = Math.floor(hash(s, 1, seed) * G), j = Math.floor(hash(s, 2, seed) * G); if (!keep(i, j)) continue;
    const tw = .5 + .5 * Math.sin(T * (.6 + hash(s, 3, seed)) + s), lvl = tw * (.4 + .6 * hash(s, 4, seed)) * strength;
    if (lvl < .15) continue;
    const col = pal([[70, 72, 96], [150, 152, 180], [245, 245, 255]], lvl, i, j);
    api.sq(i, j, 1, col);
    if (hash(s, 5, seed) < .12 && lvl > .55) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) api.sq(i + dx, j + dy, 1, dim(col, .45));
  }
}
/* a dotted pixel line from (x0, y0) to (x1, y1), every `step` cells */
function dots(api, x0, y0, x1, y1, col, step = 2) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let k = 0; k <= n; k += step) api.sq(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), 1, col);
}

/* the flower owns the middle: every world is dimmed behind the petals and
   keeps its detail outside them */
const calm = (i, j) => .3 + .7 * clamp((Math.hypot(i - c0, j - c0) - .85 * SC) / (.55 * SC));
const outside = (i, j, r = 1.22) => Math.hypot(i - c0, j - c0) > r * SC;

export const WORLDS = {
  orb: {
    name: 'Glass orb', say: 'The flower lives inside a glass sphere. Light slides over the glass and a faint mist turns inside it.',
    under(api) {
      const { T, st } = api, R = 1.42 * SC;
      const bgP = [[5, 5, 7], mix(st[0], [8, 7, 10], .9), mix(st[0], [11, 10, 13], .85)];
      const inP = [[9, 8, 11], mix(st[0], [12, 11, 15], .86), mix(st[1], [18, 16, 22], .8), mix(st[2], [26, 24, 30], .74)];
      const blobs = [0, 1, 2].map(n => [c0 + Math.cos(T * .18 + n * 2.1) * R * .5, c0 + Math.sin(T * .23 + n * 1.7) * R * .45]);
      fill(api, (i, j) => {
        const dx = i - c0, dy = j - c0, d = Math.hypot(dx, dy);
        if (d > R + .5) {
          const sx = dx / (R * .85), sy = (j - (c0 + R * 1.03)) / (R * .14), e = sx * sx + sy * sy;
          if (e < 1 && B4[j & 3][i & 3] < .85 * (1 - e)) return [3, 3, 4];
          return pal(bgP, 1 - d / (G * .72), i, j);
        }
        if (d > R - .5) return pal([[24, 24, 28], [70, 70, 80], [160, 160, 170]], .5 + .5 * Math.cos(Math.atan2(dy, dx) + Math.PI * .75), i, j);
        let v = .42 - .25 * (dx + dy) / (R * 2) - .2 * d / R;
        for (const [mx, my] of blobs) v += .12 * Math.max(0, 1 - Math.hypot(i - mx, j - my) / (R * .45));
        return dim(pal(inP, v, i, j), calm(i, j));
      });
    },
    over(api) {
      const { T, st } = api, R = 1.42 * SC, sw = Math.sin(T * .35) * .12, ring = (r, a0, a1) => { const out = []; for (let a = a0; a < a1; a += .6 / r) out.push([Math.round(c0 + Math.cos(a) * r), Math.round(c0 + Math.sin(a) * r)]); return out; };
      alpha(api, .32, () => ring(R * .9, Math.PI * (1.1 + sw), Math.PI * (1.4 + sw)).forEach(([i, j]) => api.sq(i, j, 1, [236, 236, 242])));
      const ga = Math.PI * (1.28 + sw), gi = Math.round(c0 + Math.cos(ga) * R * .93), gj = Math.round(c0 + Math.sin(ga) * R * .93);
      alpha(api, .6, () => [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([x, y]) => api.sq(gi + x, gj + y, 1, [255, 255, 255])));
      alpha(api, .18, () => ring(R * .9, Math.PI * (.12 + sw), Math.PI * (.38 + sw)).forEach(([i, j]) => api.sq(i, j, 1, st[3])));
    },
  },

  planet: {
    name: 'Planet', say: 'A huge planet in the flower\'s colours rises from the corner and turns slowly, with a ring and a small moon going round it.',
    under(api) {
      const { T, st } = api, R = 1.45 * SC, px = c0 + 1.55 * SC, py = c0 + 1.5 * SC;
      const base = mix(mix(st[0], [40, 40, 60], .5), [0, 0, 0], .4);
      const shades = [[5, 5, 9], dim(base, .45), dim(base, .75), base, mix(base, st[1], .25)];
      const space = [5, 5, 9];
      fill(api, (i, j) => {
        const dx = i - px, dy = j - py, d = Math.hypot(dx, dy);
        if (d <= R) {
          const nz = Math.sqrt(Math.max(0, 1 - (d / R) ** 2)), light = clamp((-dx - dy) / R * .45 + nz * .55);
          const band = Math.floor((j - py + R) / 3.2), tex = hash(Math.floor((i + T * (1.5 + band % 3)) / 5), band, 3);
          return dim(pal(shades, clamp(light * .85 + (band % 2 ? .04 : -.03) + (tex - .5) * .1), i, j), calm(i, j));
        }
        if (d <= R + 1.2 && dx + dy < -R * .3) return dim(pal([space, dim(st[2], .4)], .5, i, j), calm(i, j));
        return space;
      });
      stars(api, 70, 11, .7, (i, j) => outside(i, j) && Math.hypot(i - px, j - py) > R + 1.5);
      // the ring and the moon stay behind the flower: nothing crosses the petals
      for (let a = 0; a < 2 * Math.PI; a += .012) for (const rr of [1.32, 1.38, 1.44]) {
        const x = Math.cos(a) * R * rr, y = Math.sin(a) * R * rr * .27, i = Math.round(px + x * Math.cos(-.5) - y * Math.sin(-.5)), j = Math.round(py + x * Math.sin(-.5) + y * Math.cos(-.5));
        const front = Math.sin(a) > 0; if (!outside(i, j, 1.18) || (!front && Math.hypot(i - px, j - py) < R)) continue;
        api.sq(i, j, 1, pal([dim(st[2], .35), dim(mix(st[2], [255, 255, 255], .15), .7)], rr === 1.38 ? .8 : .3, i, j));
      }
      const moonA = T * .3, mx = px + Math.cos(moonA) * R * 1.55, my = py + Math.sin(moonA) * R * .42;
      if (Math.hypot(mx - c0, my - c0) > 1.3 * SC) for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (i * i + j * j <= 5) api.sq(Math.round(mx) + i, Math.round(my) + j, 1, pal([[44, 42, 48], [110, 106, 110], [180, 176, 170]], clamp(.55 - (i + j) * .15), i, j));
    },
  },

  sky: {
    name: 'Night sky', say: 'A deep night sky. Every thriving day lights one more star in a constellation around the flower, and now and then a star falls.',
    under(api) {
      const { T, st } = api;
      const P = [[4, 5, 14], [6, 8, 20], mix([10, 9, 26], st[0], .08), mix([15, 10, 24], st[0], .12)];
      fill(api, (i, j) => dim(pal(P, j / G, i, j), calm(i, j)));
      stars(api, 110, 23, .75, (i, j) => outside(i, j));
      const n = 13, lit = Math.min(n, api.stars ?? Math.floor((T % 18) / 1.2) + 1), pts = [];   // one star per thriving day
      for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + k / n * 2 * Math.PI + (hash(k, 1, 5) - .5) * .3, r = SC * (1.3 + .14 * hash(k, 2, 5)); pts.push([Math.round(c0 + Math.cos(a) * r), Math.round(c0 + Math.sin(a) * r)]); }
      const lineCol = mix(dim(st[3], .3), [44, 44, 64], .5);
      for (let k = 1; k < Math.min(lit, n); k++) dots(api, ...pts[k - 1], ...pts[k], lineCol, 3);
      pts.forEach(([i, j], k) => {
        if (k >= lit) { api.sq(i, j, 1, [44, 46, 64]); return; }
        const bright = dim(mix(st[3], [255, 255, 255], .45), .85);
        api.sq(i, j, 1, bright);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) api.sq(i + dx, j + dy, 1, dim(bright, .4));
      });
      const sp = (T % 9) / 9;
      if (sp < .14) {
        const u = sp / .14, hx = Math.round(G * (.08 + .5 * u)), hy = Math.round(G * (.05 + .12 * u));
        for (let t = 0; t < 8; t++) alpha(api, (1 - t / 8) * (1 - u * .6) * .7, () => api.sq(hx - t * 2, hy - t, 1, [240, 240, 236]));
      }
    },
  },

  pond: {
    name: 'Pond', say: 'The flower floats on a lily pad in dark water. Rings spread out from it and light moves under the surface.',
    under(api) {
      const { T } = api, R = 1.3 * SC, notch = .3, n0 = .9 + notch / 2, core = 1.12 * SC;
      const water = [[3, 8, 11], [5, 15, 20], [8, 24, 30], [12, 33, 39]], pad = [[12, 32, 20], [17, 44, 27], [24, 58, 34]];
      fill(api, (i, j) => {
        const dx = i - c0, dy = j - c0, d = Math.hypot(dx, dy);
        let a = Math.atan2(dy, dx); if (a < 0) a += 2 * Math.PI;
        const inNotch = ((a - (.9 - notch / 2)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) < notch;
        if (d <= R && !inNotch) {
          if (d < core) return pal([[10, 27, 17], [13, 33, 21]], .5, i, j);
          if (d > R - .8) return pad[0];
          const rel = (a - n0 + 2 * Math.PI) % (2 * Math.PI), vein = Math.abs(((rel / ((2 * Math.PI - notch) / 12)) % 1) - .5) > .44;
          return vein ? pad[2] : pal(pad, .6 - .3 * (d - core) / (R - core), i, j);
        }
        const caustic = Math.sin(i * .33 + T * .7) * Math.sin(j * .29 - T * .55) > .7 ? .1 : 0;
        return pal(water, .85 - d / (G * .8) + caustic, i, j);
      });
      for (let n = 0; n < 3; n++) {
        const u = (T * .2 + n / 3) % 1, rr = SC * (1.38 + u * .5), N = Math.round(70 + u * 60);
        alpha(api, (1 - u) * .45, () => { for (let d = 0; d < N; d++) { const a = d / N * 2 * Math.PI; api.sq(Math.round(c0 + Math.cos(a) * rr), Math.round(c0 + Math.sin(a) * rr * .94), 1, [90, 160, 150]); } });
      }
      const gi = Math.round(G * .86), gj = Math.round(G * .12);
      [[0, 0, .6], [1, 0, .3], [-1, 0, .3], [0, 1, .25], [0, -1, .25]].forEach(([x, y, a]) => alpha(api, a, () => api.sq(gi + x, gj + y, 1, [220, 232, 228])));
    },
  },

  daylight: {
    name: 'Daylight', say: 'The sky behind the flower follows the real time of day: dawn, noon, dusk, night. ',
    under(api) {
      const { T } = api, P = api.dayFrac ?? (T % 24) / 24;   // 0 at 6 in the morning
      const keys = [[0, [26, 20, 44], [104, 60, 60]], [.22, [40, 62, 96], [88, 92, 100]], [.45, [30, 56, 94], [66, 86, 106]], [.62, [40, 24, 58], [112, 60, 46]], [.75, [8, 9, 22], [22, 18, 36]], [.97, [7, 8, 20], [18, 15, 32]], [1, [26, 20, 44], [104, 60, 60]]];
      let a = keys[0], b = keys[1]; for (let k = 0; k < keys.length - 1; k++) if (P >= keys[k][0] && P <= keys[k + 1][0]) { a = keys[k]; b = keys[k + 1]; }
      const u = (P - a[0]) / Math.max(1e-6, b[0] - a[0]), top = lerpC(a[1], b[1], u), bot = lerpC(a[2], b[2], u);
      const steps = [0, 1, 2, 3, 4].map(s => lerpC(top, bot, s / 4));
      const sunU = P / .7, sx = G * (.05 + .9 * sunU), sy = G * (.5 - .44 * Math.sin(clamp(sunU) * Math.PI));
      const mu = (P - .7) / .3, mx = G * (.1 + .8 * mu), my = G * (.45 - .36 * Math.sin(clamp(mu) * Math.PI));
      fill(api, (i, j) => {
        const sky = dim(pal(steps, j / G, i, j), calm(i, j));
        if (!outside(i, j, 1.2)) return sky;
        if (sunU < 1) {
          const d = Math.hypot(i - sx, j - sy);
          if (d <= 2.2) return [232, 214, 180];
          if (d <= 5.5 && B4[j & 3][i & 3] < .6 * (1 - (d - 2.2) / 3.3)) return mix(sky, [220, 180, 130], .45);
        } else if (mu >= 0) {
          const d = Math.hypot(i - mx, j - my), cut = Math.hypot(i - mx - 1.2, j - my + .8);
          if (d <= 2.4 && cut > 2.1) return [206, 206, 196];
        }
        return sky;
      });
      const night = clamp((P - .66) / .08) * (1 - clamp((P - .97) / .03));
      if (night > 0) stars(api, 90, 31, night * .75, (i, j) => outside(i, j));
    },
  },
};

/* ---- insects: all built on the first butterfly: about 7 pixels across, drawn
   like the petals (the same cell size and gaps, softer colours), and all moving
   the way it did: a lazy curve in, a rest on a petal tip with the wings slowly
   opening and closing, then a drift away ---- */
const ease3 = u => 1 - (1 - clamp(u)) ** 3;
const soften = c => mix(dim(c, .94), [118, 114, 110], .1);

/* where an insect is at time T: in flight, at rest on a petal tip, or gone */
function flight(T, { period = 15, offset = 0, perchT = .8, perchQ = .18, wobble = 2.5, lift = 1.5 } = {}) {
  const t = Math.max(0, T + offset), visit = Math.floor(t / period), p = (t % period) / period, k = (visit * 2 + 1) % H;   // t is kept at 0 or more: a follower's delayed clock starts below 0
  const [lx, ly] = toCell(k, 1, perchT, perchQ), land = [lx, ly - lift], side = visit % 2 ? 1 : -1;
  const from = [c0 + side * 1.9 * SC, c0 - 1.4 * SC], to = [c0 - side * 1.9 * SC, c0 - 1.7 * SC];
  if (p < .3) { const u = ease3(p / .3); return { x: from[0] + (land[0] - from[0]) * u + Math.sin(u * 9) * wobble * (1 - u), y: from[1] + (land[1] - from[1]) * u + Math.cos(u * 7) * wobble * .8 * (1 - u), flying: true, on: true }; }
  if (p < .72) return { x: land[0], y: land[1], flying: false, on: true };
  const u = clamp((p - .72) / .28) ** 2;
  return { x: land[0] + (to[0] - land[0]) * u + Math.sin(u * 8) * wobble * .8, y: land[1] + (to[1] - land[1]) * u, flying: true, on: p < .995 };
}
/* wings open or shut: a fast beat in flight, a slow open and close at rest */
const wingsOpen = (T, flying, beat = 22, rest = 2.2) => flying ? Math.sin(T * beat) > 0 : Math.sin(T * rest) > -.3;

/* draw cells [dx, dy, colour]: `wings` are mirrored left and right, `body` is
   drawn as given. Colours lean a little toward the petal's own tone (`tint`) so
   the insect belongs to the flower, and a faint one-cell shadow down and to
   the right sits under it, so it stands off the petal just slightly. */
function bug(api, x, y, wings, body, tint = .14) {
  const bx = Math.round(x), by = Math.round(y), cells = [...wings.flatMap(([dx, dy, c]) => [[dx, dy, c], [-dx, dy, c]]), ...body];
  const at = new Set(cells.map(([dx, dy]) => dx + ',' + dy));
  alpha(api, .28, () => { for (const [dx, dy] of cells) if (!at.has((dx + 1) + ',' + (dy + 1))) api.sq(bx + dx + 1, by + dy + 1, .82, [8, 8, 10]); });
  for (const [dx, dy, c] of cells) api.sq(bx + dx, by + dy, .82, mix(soften(c), api.st[1], tint));
}
/* the first butterfly's wing, open and shut, with a colour for each cell */
const OPEN = [[1, -1, 'w'], [2, -1, 'w'], [3, -1, 'e'], [1, -2, 'w'], [2, -2, 'w'], [3, -2, 'e'], [2, -3, 'e'], [1, 0, 'w'], [2, 0, 'e'], [1, 1, 'e'], [2, 1, 'e']];
const SHUT = [[1, -1, 'w'], [1, -2, 'w'], [1, -3, 'e'], [1, 0, 'e']];
const paint = (cells, pal) => cells.map(([dx, dy, k]) => [dx, dy, typeof pal[k] === 'function' ? pal[k](dx, dy) : pal[k]]);
const column = (from, to, colour) => Array.from({ length: to - from + 1 }, (_, n) => [0, from + n, typeof colour === 'function' ? colour(from + n) : colour]);

/* Each colour's insect sits a little apart from that colour's petals (a
   warm insect on a cool flower and the other way round), without shouting.
   Crimson keeps the ladybird, set apart by its black spots and head.
   Iris, the last colour, keeps the shimmering blue morpho as it was. */
export const INSECTS = [
  {
    tier: 0, name: 'Ladybird', say: 'A red ladybird with black spots flies in, folds its spotted wing cases and rests on a petal tip, then opens them and flies off.',
    over(api) {
      const { T } = api, f = flight(T, { period: 16, offset: 2, lift: 1 }); if (!f.on) return;
      const red = [226, 96, 46], black = [22, 14, 14], wing = [196, 190, 184];
      if (!f.flying) { bug(api, f.x, f.y, [[1, -1, red], [1, 0, black], [1, 1, red]], [[0, -2, black], [0, -1, black], [0, 0, red], [0, 1, red]], .04); return; }
      const open = Math.sin(T * 22) > 0;
      bug(api, f.x, f.y, [[1, -1, red], [2, -1, red], [1, 0, black], ...(open ? [[2, 0, wing], [3, 0, wing], [2, 1, wing]] : [[2, 0, wing]])], [[0, -2, black], [0, -1, red], [0, 0, red]], .04);
    },
  },
  {
    tier: 1, name: 'Firefly', say: 'A firefly drifts in and rests on a petal, its tail blinking softly and lighting the pixels around it.',
    over(api) {
      const { T } = api, f = flight(T, { period: 17, offset: 5, wobble: 3 }); if (!f.on) return;
      const glow = Math.max(0, Math.sin(T * 1.8)) ** 2, tail = lerpC([96, 100, 60], [226, 250, 140], glow);
      if (glow > .05) {
        const gx = Math.round(f.x), gy = Math.round(f.y) + 1;
        for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const d = Math.hypot(i, j); if (d > 0 && d < 3.2 && B4[(gy + j) & 3][(gx + i) & 3] < glow * (1 - d / 3.2) * .8) alpha(api, .45, () => api.sq(gx + i, gy + j, .82, [215, 245, 130])); }
      }
      const pal = { w: [184, 190, 198], e: [150, 156, 166] };
      bug(api, f.x, f.y, paint(wingsOpen(T, f.flying) ? OPEN.filter(([, dy]) => dy <= -1) : SHUT.filter(([, dy]) => dy <= -1), pal), [[0, -2, [52, 44, 38]], [0, -1, [70, 58, 44]], [0, 0, [140, 96, 50]], [0, 1, tail]]);
    },
  },
  {
    tier: 2, name: 'Red admiral', say: 'A red admiral, dark with a red band and white tips, flies in, rests on a petal and slowly opens and closes its wings.',
    over: (...a) => butterfly({ offset: 1, w: [46, 38, 42], e: [192, 72, 52], body: [38, 30, 32], open: [[3, -2, [228, 224, 216]]] })(...a),
  },
  {
    tier: 3, name: 'Monarch', say: 'A soft orange monarch flies in, rests on a petal and slowly opens and closes its wings.',
    over(api) {
      const { T } = api, f = flight(T, { period: 16, offset: 5, wobble: 3 }); if (!f.on) return;
      const open = wingsOpen(T, f.flying, 18, 1.8), wings = paint(open ? OPEN : SHUT, { w: [214, 142, 70], e: [58, 40, 30] });
      if (open) wings.push([3, -2, [226, 214, 190]], [2, 1, [226, 214, 190]]);
      bug(api, f.x, f.y, wings, column(-2, 1, [50, 36, 28]));
    },
  },
  {
    tier: 4, name: 'Luna moth', say: 'A green luna moth with long tails flutters in, rests on a petal with its wings slowly opening, and flutters away.',
    over(api) {
      const { T } = api, f = flight(T, { period: 18, offset: 3, wobble: 3 }); if (!f.on) return;
      const pal = { w: [132, 194, 112], e: [90, 150, 82] }, open = wingsOpen(T, f.flying, 14, 1.6);
      const wings = paint(open ? [...OPEN, [2, 2, 'e'], [2, 3, 'e']] : [...SHUT, [1, 1, 'e'], [1, 2, 'e']], pal);
      if (open) wings.push([2, -2, [206, 160, 76]]);
      bug(api, f.x, f.y, wings, column(-2, 1, [226, 226, 208]));
    },
  },
  {
    tier: 5, name: 'Blue morpho', say: 'A blue morpho flies in, lands on a petal and slowly opens and closes its shimmering wings.',
    over(api) {
      const { T } = api, f = flight(T, { period: 14, offset: 0 }); if (!f.on) return;
      const shimmer = (dx, dy) => { const v = .5 + .5 * Math.sin(T * 2.2 + dx * .9 - dy * .6); return v < .5 ? lerpC([44, 96, 226], [86, 196, 246], v * 2) : lerpC([86, 196, 246], [128, 96, 240], (v - .5) * 2); };
      bug(api, f.x, f.y, paint(wingsOpen(T, f.flying, 18, 1.6) ? OPEN : SHUT, { w: shimmer, e: [26, 34, 74] }), column(-2, 1, [28, 24, 30]), 0);
    },
  },
];

/* ---- insect options: four for each colour, the first being the current pick.
   All share the first butterfly's size, grid and flight. ---- */

/* a butterfly or moth on the first butterfly's wing: w inner, e outer (a colour
   or a function of dx, dy), extra cells when open, optional tails, antennae */
function butterfly({ period = 16, offset = 0, wobble = 3, beat = 18, rest = 1.8, w, e, body, open: extra = [], shut: shutExtra = [], tails = false, feelers = false, tint } = {}) {
  return api => {
    const { T } = api, f = flight(T, { period, offset, wobble }); if (!f.on) return;
    const open = wingsOpen(T, f.flying, beat, rest);
    const cells = paint(open ? [...OPEN, ...(tails ? [[2, 2, 'e'], [2, 3, 'e']] : [])] : [...SHUT, ...(tails ? [[1, 1, 'e'], [1, 2, 'e']] : [])], { w, e });
    cells.push(...(open ? extra : shutExtra));
    const b = column(-2, 1, body);
    if (feelers) b.push([1, -4, body], [-1, -4, body]);
    bug(api, f.x, f.y, cells, b, tint);
  };
}
const beeOver = api => {
  const { T } = api, f = flight(T, { period: 13, offset: 8, wobble: 3.5 }); if (!f.on) return;
  const y = f.y + (f.flying ? Math.sin(T * 9) * .6 : 0), pal = { w: [206, 214, 222], e: [170, 176, 186] }, dark = [44, 32, 28], yel = [226, 178, 76];
  bug(api, f.x, y, paint(wingsOpen(T, f.flying, 30, 7) ? OPEN.filter(([, dy]) => dy <= -1) : SHUT.filter(([, dy]) => dy <= -1), pal), [[0, -2, dark], [0, -1, yel], [0, 0, dark], [0, 1, yel], [0, 2, dark], [1, 0, yel], [-1, 0, yel]]);
};

/* the blue morpho's shimmer, shared by its Iris variants */
const morphoBlue = T => (dx, dy) => { const v = .5 + .5 * Math.sin(T * 2.2 + dx * .9 - dy * .6); return v < .5 ? lerpC([44, 96, 226], [86, 196, 246], v * 2) : lerpC([86, 196, 246], [128, 96, 240], (v - .5) * 2); };
function morpho(api, { offset = 0, perchT = .8, perchQ = .18, under = false, trail = false, delay = 0 } = {}) {
  const { T } = api, t = T - delay, f = flight(t, { period: 14, offset, perchT, perchQ }); if (!f.on) return;
  const open = wingsOpen(T, f.flying, 18, 1.6), blue = morphoBlue(T);
  if (trail) {
    // a trail of blue dust behind it in flight, and a few specks lifting off it at rest
    for (let n = 1; n <= 9; n++) {
      const p = flight(t - n * .07, { period: 14, offset, perchT, perchQ }); if (!p.on || !p.flying) continue;
      const i = Math.round(p.x + (hash(n, Math.floor(T * 6), 3) - .5) * 2), j = Math.round(p.y + 1 + (hash(n, Math.floor(T * 6), 5) - .5) * 2);
      alpha(api, .7 * (1 - n / 10), () => api.sq(i, j, .5, blue(n, 0)));
    }
    if (!f.flying && open) for (let n = 0; n < 3; n++) {
      const life = (T * .7 + n / 3) % 1, i = Math.round(f.x + (hash(n, Math.floor(T * .7 + n / 3), 9) - .5) * 8), j = Math.round(f.y - 2 - life * 5);
      alpha(api, .6 * (1 - life), () => api.sq(i, j, .45, blue(n * 2, 1)));
    }
  }
  const brown = (dx, dy) => (dx === 1 && dy === -2) ? [222, 184, 96] : [112, 84, 62];
  const wings = paint(open ? OPEN : SHUT, { w: under && !open ? brown : blue, e: under && !open ? [70, 52, 40] : [26, 34, 74] });
  bug(api, f.x, f.y, wings, column(-2, 1, [28, 24, 30]), 0);
}

/* a hawk-moth: it never lands. It hovers just off a petal tip on a blur of
   wings, feeding through its long tongue, then darts to the next */
function hover({ period = 15, offset = 4, fore, hind, body, stripe = null, tip = null } = {}) {
  return api => {
    const { T } = api, f = flight(T, { period, offset, wobble: 2, lift: 3.2 }); if (!f.on) return;
    const x = f.x + (f.flying ? 0 : Math.sin(T * 3.1) * .6), y = f.y + (f.flying ? 0 : Math.sin(T * 4.3) * .5);
    const up = Math.sin(T * 44) > 0;   // the wings beat too fast to see: two positions, swapped every frame
    const wings = up ? [[2, -2, fore], [2, -1, fore], [3, -1, fore], [2, 0, hind], [3, 0, hind]] : [[2, -1, fore], [3, -1, fore], [2, 0, hind], [3, 1, hind]];
    // a stout body, two cells wide in the middle, striped or with a pale tail tip
    const at = dy => stripe && dy % 2 ? stripe : body, b = [...column(-2, 2, at), [1, -1, at(-1)], [-1, -1, at(-1)], [1, 0, at(0)], [-1, 0, at(0)], [1, 1, at(1)], [-1, 1, at(1)]];
    if (tip) b.push([0, 2, tip]);
    if (!f.flying) b.push([0, 3, [70, 58, 48]], [0, 4, [70, 58, 48]]);   // the tongue, reaching down into the flower
    bug(api, x, y, wings, b);
  };
}
/* a glasswing: clear wings that show the petal through them, with dark veins at the edge */
function glasswing({ period = 17, offset = 3 } = {}) {
  return api => {
    const { T } = api, f = flight(T, { period, offset, wobble: 3 }); if (!f.on) return;
    const clear = mix(api.st[2], [250, 252, 255], .45), open = wingsOpen(T, f.flying, 16, 1.5);
    const wings = paint(open ? OPEN : SHUT, { w: clear, e: [52, 40, 36] });
    if (open) wings.push([3, -2, [236, 234, 228]]);
    bug(api, f.x, f.y, wings, column(-2, 1, [40, 32, 30]), 0);
  };
}

/* One theme runs through the colours: the visitors get rarer and more
   beautiful as the flower does. Humble garden visitors at Crimson, evening
   flyers at Ember, meadow butterflies at Gold, big showy butterflies at Jade,
   pale night moths and glass at Frost, and the morpho at Iris. Every one is
   something that really visits flowers. */
export const INSECT_OPTIONS = [
  /* Crimson: humble garden visitors */
  [
    { name: 'Ladybird', say: 'The current pick: orange-scarlet with black spots.', over: INSECTS[0].over },
    { name: 'Honeybee', say: 'A striped honeybee, honey and dark brown, wings twitching as it rests.', over: beeOver },
    { name: 'Cabbage white', say: 'The small cream butterfly of every garden, with dark wing tips.', over: butterfly({ offset: 2, w: [226, 222, 206], e: [74, 68, 66], body: [66, 60, 56], open: [[2, -2, [96, 90, 84]]], tint: .08 }) },
  ],
  /* Ember: evening flyers */
  [
    { name: 'Firefly', say: 'The current pick: a dark body whose tail blinks like an ember and lights the petal.', over: INSECTS[1].over },
    { name: 'Hummingbird hawk-moth', say: 'It never lands: it hovers off a petal tip on a blur of wings, drinking through its long tongue, then darts off.', over: hover({ fore: [118, 106, 96], hind: [190, 92, 42], body: [96, 86, 78], tip: [226, 224, 214] }) },
    { name: 'Elephant hawk-moth', say: 'A pink and olive dusk moth that hovers to feed, its body striped pink.', over: hover({ offset: 7, fore: [126, 118, 66], hind: [214, 112, 148], body: [120, 112, 62], stripe: [214, 112, 148] }) },
  ],
  /* Gold: meadow butterflies */
  [
    { name: 'Red admiral', say: 'The current pick: dark wings with a red band and white tips.', over: INSECTS[2].over },
    { name: 'Common blue', say: 'A small soft-blue meadow butterfly with a pale fringe.', over: butterfly({ offset: 1, w: [112, 140, 204], e: [58, 62, 90], body: [50, 50, 62], open: [[3, -1, [220, 220, 228]]] }) },
    { name: 'Peacock', say: 'Deep maroon wings with a blue and cream eyespot.', over: butterfly({ offset: 1, w: [140, 50, 58], e: [64, 42, 46], body: [48, 34, 36], open: [[2, -2, [120, 150, 214]], [3, -1, [228, 208, 150]]] }) },
  ],
  /* Jade: big showy butterflies */
  [
    { name: 'Monarch', say: 'The current pick: soft orange with dark edges.', over: INSECTS[3].over },
    { name: 'Swallowtail', say: 'Yellow and black, with long tails and a blue spot.', over: butterfly({ offset: 5, w: [226, 198, 96], e: [42, 36, 32], body: [40, 34, 30], tails: true, open: [[2, 1, [120, 140, 200]]] }) },
    { name: 'Painted lady', say: 'Peach-orange wings with dark tips and white spots.', over: butterfly({ offset: 5, w: [222, 150, 108], e: [62, 46, 40], body: [60, 46, 40], open: [[3, -2, [232, 226, 214]]] }) },
  ],
  /* Frost: pale night moths and glass */
  [
    { name: 'Luna moth', say: 'The current pick: green with long tails.', over: INSECTS[4].over },
    { name: 'Rosy maple moth', say: 'A fluffy pink and butter-yellow moth with feelers.', over: butterfly({ offset: 3, beat: 12, rest: 1.2, w: [220, 136, 158], e: [232, 204, 112], body: [236, 210, 122], feelers: true, tint: .06 }) },
    { name: 'Glasswing', say: 'Clear wings that show the frosted petal through them, edged in dark veins.', over: glasswing() },
  ],
  /* Iris: the blue morpho, kept, and three ways to make it more special */
  [
    { name: 'Blue morpho', say: 'The current pick, as it is.', over: INSECTS[5].over },
    { name: 'Morpho flash', say: 'Like a real morpho: the undersides are brown with a gold eyespot, so the blue flashes only when it opens its wings.', over: api => morpho(api, { under: true }) },
    { name: 'Morpho dust', say: 'It leaves a short trail of blue dust in flight, and a few specks drift up from it while it rests.', over: api => morpho(api, { trail: true }) },
    { name: 'Morpho pair', say: 'Two morphos. The second follows the first a moment later and rests beside it on the same petal.', over: api => { morpho(api, { perchT: .56, perchQ: -.5, delay: .9 }); morpho(api); } },
  ],
];
