// The sky behind the Dash header, drawn once on a canvas (theme flair).
// halftone: Yoru, a dot grid whose dot size follows a glow at the top right
// and a thin horizon, with scattered stars (sky() in v-yoru.html). The CSS
// mask on .dash-sky fades it out downwards. Seeded, so a redraw on resize
// gives the same sky.
// Park-Miller, as in the mockups. The floor form gives the same sequence as
// `(seed * 16807) % 2147483647` (every product is an exact integer below 2^46)
// at about half the cost of a floating-point modulo.
const MOD = 2147483647;
export const seeded = start => { let seed = start; return () => { const next = seed * 16807; seed = next - Math.floor(next / MOD) * MOD; return seed / MOD; }; };

const HALFTONE_STEP = 7, STARS = 160;

export function drawHalftone(ctx, w, h) {
  const rnd = seeded(5);
  // A wider window keeps the 7px grid; the cell count grows with the width only.
  for (let Y = HALFTONE_STEP / 2; Y < h; Y += HALFTONE_STEP) {
    for (let X = HALFTONE_STEP / 2; X < w; X += HALFTONE_STEP) {
      const u = X / w, v = Y / h;
      const glow = Math.exp(-(Math.pow((u - .96) / .26, 2) + Math.pow((v - .02) / .5, 2)));
      const horizon = Math.exp(-Math.pow((v - .58) / .045, 2)) * (.25 + .75 * u) * .55;
      const l = Math.min(1, glow * .95 + horizon + (rnd() - .5) * .08);
      const r = l * 2.5;
      if (r < .5) continue;
      ctx.fillStyle = `rgba(${Math.round(236 + 19 * l)},${Math.round(200 - 60 * l)},${Math.round(160 - 90 * l)},${(.1 + .32 * l).toFixed(2)})`;
      ctx.fillRect(X - r / 2, Y - r / 2, r, r);
    }
  }
  for (let i = 0; i < STARS; i++) {
    const X = rnd() * w, Y = rnd() * h * .7;
    ctx.fillStyle = `rgba(236,231,220,${(.15 + rnd() * .5).toFixed(2)})`;
    ctx.fillRect(X, Y, 1.1, 1.1);
  }
}

export const SKIES = { halftone: drawHalftone };

/** Size the canvas to its box at up to 2x and draw the named sky. */
export function paintSky(canvas, kind) {
  const draw = SKIES[kind];
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx || !w || !h) return;
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (draw) draw(ctx, w, h);
}
