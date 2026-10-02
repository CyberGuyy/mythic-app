'use client';
// A line icon (ICONS in icons.js) redrawn as a dot-matrix glyph, so it sits
// on the habit flower in the flower's own language: square dots on a grid,
// like its petal pixels and the Yoru dot ground, not a smooth vector laid on
// top. The icon is drawn once into a small canvas at six samples a dot, each
// dot is on when enough of its square is inked, and the result is one SVG
// path of squares filled with currentColor (so CSS still sets done, bare and
// hover). Glyphs are cached per icon for the page's life.
import { createElement as h, useEffect, useState } from 'react';
import { ICONS } from './icons.js';

export const GLYPH = 13;          // dots across and down
const SAMPLES = 6;                // canvas pixels a dot, each way
const STROKE = 2;                 // the icon's stroke on its 24 grid when sampled
const INK = 0.3;                  // how much of a dot must be inked for it to show
const DOT = 0.78;                 // a dot's side as a share of the pitch

const cache = new Map();

/** The glyph's dots as an SVG path in dot units, or null until drawn. */
function drawGlyph(name) {
  if (cache.has(name)) return cache.get(name);
  const size = GLYPH * SAMPLES;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="#000" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  const img = new Image();
  const job = new Promise(resolve => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, size, size);
      const alpha = ctx.getImageData(0, 0, size, size).data;
      const inset = (1 - DOT) / 2;
      let d = '';
      for (let j = 0; j < GLYPH; j++) for (let i = 0; i < GLYPH; i++) {
        let sum = 0;
        for (let v = 0; v < SAMPLES; v++) for (let u = 0; u < SAMPLES; u++) sum += alpha[((j * SAMPLES + v) * size + i * SAMPLES + u) * 4 + 3];
        if (sum / (SAMPLES * SAMPLES * 255) >= INK) d += `M${(i + inset).toFixed(2)} ${(j + inset).toFixed(2)}h${DOT}v${DOT}h-${DOT}z`;
      }
      cache.set(name, d);
      resolve(d);
    };
    img.onerror = () => { cache.set(name, ''); resolve(''); };
  });
  cache.set(name, job);
  img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
  return job;
}

/** One glyph, GLYPH dots across at `pitch` pixels a dot. */
export function PixelIcon({ name, pitch = 2, className }) {
  const cached = cache.get(name);
  const [drawn, setDrawn] = useState(() => (typeof cached === 'string' ? { name, d: cached } : null));
  useEffect(() => {
    let live = true;
    Promise.resolve(drawGlyph(name)).then(d => { if (live) setDrawn({ name, d }); });
    return () => { live = false; };
  }, [name]);
  const d = drawn?.name === name ? drawn.d : '';
  const side = GLYPH * pitch;
  return h('svg', { viewBox: `0 0 ${GLYPH} ${GLYPH}`, width: side, height: side, 'aria-hidden': true, className, shapeRendering: 'crispEdges' },
    h('path', { d, fill: 'currentColor' }));
}
