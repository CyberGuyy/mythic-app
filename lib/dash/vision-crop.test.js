import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverRect, cropStyle, panCrop, zoomCrop, frameAspect, rowsForShape, SHAPES } from './vision-crop.js';

const near = (actual, expected, why) => assert.ok(Math.abs(actual - expected) < 1e-6, `${why}: ${actual} vs ${expected}`);

test('the default crop is the old centred cover', () => {
  // a 4:3 photo in a 16:9.6 frame: width fills, height overflows evenly
  const r = coverRect(160, 96, 400, 300);
  near(r.dw, 160, 'dw'); near(r.dh, 120, 'dh'); near(r.dx, 0, 'dx'); near(r.dy, -12, 'dy');
});

test('x and y slide the photo to its edges; zoom crops tighter', () => {
  near(coverRect(160, 96, 400, 300, { x: 0.5, y: 0 }).dy, 0, 'top edge');
  near(coverRect(160, 96, 400, 300, { x: 0.5, y: 1 }).dy, -24, 'bottom edge');
  const zoomed = coverRect(160, 96, 400, 300, { x: 0, y: 0.5, zoom: 2 });
  near(zoomed.dw, 320, 'zoomed width'); near(zoomed.dx, 0, 'left edge');
  near(coverRect(160, 96, 400, 300, { x: 1, y: 0.5, zoom: 2 }).dx, -160, 'right edge');
  near(coverRect(160, 96, 400, 300, { zoom: 9 }).dw, 480, 'zoom stops at 3');
});

test('the CSS placement matches', () => {
  assert.deepEqual(cropStyle({ x: 0.25, y: 1, zoom: 1 }), { objectPosition: '25.00% 100.00%', transformOrigin: '25.00% 100.00%', transform: undefined });
  assert.equal(cropStyle({ x: 0.5, y: 0.5, zoom: 1.5 }).transform, 'scale(1.5)');
});

test('panning follows the pointer and stops at the edges', () => {
  const crop = { x: 0.5, y: 0.5, zoom: 1 };
  const down = panCrop(crop, 0, 12, 160, 96, 400, 300);
  near(down.y, 0, 'dragging down 12px shows the top'); near(down.x, 0.5, 'no spare width, x stays');
  near(panCrop(crop, 0, 100, 160, 96, 400, 300).y, 0, 'stops at the edge');
  near(panCrop(crop, 0, -6, 160, 96, 400, 300).y, 0.75, 'up 6px');
  const zoomed = { x: 0.5, y: 0.5, zoom: 2 };
  near(panCrop(zoomed, 80, 0, 160, 96, 400, 300).x, 0, 'zoomed, right 80px shows the left edge');
});

test('zooming keeps the point under the pointer still', () => {
  const crop = { x: 0.5, y: 0.5, zoom: 1 };
  const next = zoomCrop(crop, 2, 160, 96, 400, 300, 40, 48);
  const before = coverRect(160, 96, 400, 300, crop), after = coverRect(160, 96, 400, 300, next);
  near((40 - before.dx) / before.dw, (40 - after.dx) / after.dw, 'same photo point under x 40');
  near((48 - before.dy) / before.dh, (48 - after.dy) / after.dh, 'same photo point under y 48');
  assert.equal(zoomCrop(crop, 0.5, 160, 96, 400, 300).zoom, 1);
  assert.deepEqual(zoomCrop({ x: 0.2, y: 0.8, zoom: 2 }, 1, 160, 96, 400, 300, 80, 48).zoom, 1);
});

test('frame shapes pick the rows nearest the ratio', () => {
  near(frameAspect(6, 6, 222), 1 / 0.6, 'the default 6 by 6 is 16:9.6');
  const heights = SHAPES.map(([, , ratio]) => rowsForShape(6, ratio, 222));
  assert.deepEqual(heights, [4, 6, 7, 10]);
  assert.ok(heights.every((h, i) => i === 0 || h >= heights[i - 1]), 'taller shapes get more rows');
  assert.equal(rowsForShape(3, 1, 222), 5);
});
