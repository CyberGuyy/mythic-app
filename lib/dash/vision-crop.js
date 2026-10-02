// The vision board's crop maths, shared by the canvas bake, the tile's live
// CSS look and the frame pop-up so all three put the photo in the same place.
// A crop is { x, y, zoom }: x and y place the photo like CSS object-position
// (0 its left or top edge against the frame's, 1 its right or bottom, 0.5
// centred) and zoom scales it past "cover" (1 the whole photo filling the
// frame, 2 half of it, 3 a third). The grid numbers match vision.css.
export const CROP = { minZoom: 1, maxZoom: 3 };
export const GRID_GAP = 10;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Where the photo is drawn inside a frame: { dx, dy, dw, dh } in the
 *  frame's pixels. */
export function coverRect(frameW, frameH, imageW, imageH, { x = 0.5, y = 0.5, zoom = 1 } = {}) {
  const k = Math.max(frameW / imageW, frameH / imageH) * clamp(zoom, CROP.minZoom, CROP.maxZoom);
  const dw = imageW * k, dh = imageH * k;
  return { dx: (frameW - dw) * clamp(x, 0, 1), dy: (frameH - dh) * clamp(y, 0, 1), dw, dh };
}

/** The same placement as CSS for an <img> with object-fit: cover. */
export function cropStyle({ x = 0.5, y = 0.5, zoom = 1 } = {}) {
  const at = `${(clamp(x, 0, 1) * 100).toFixed(2)}% ${(clamp(y, 0, 1) * 100).toFixed(2)}%`;
  return { objectPosition: at, transformOrigin: at, transform: zoom > 1 ? `scale(${clamp(zoom, CROP.minZoom, CROP.maxZoom)})` : undefined };
}

/** Drag the photo by (moveX, moveY) frame pixels: it follows the pointer and
 *  stops at its edges. An axis with no spare photo does not move. */
export function panCrop(crop, moveX, moveY, frameW, frameH, imageW, imageH) {
  const { dw, dh } = coverRect(frameW, frameH, imageW, imageH, crop);
  const spareX = dw - frameW, spareY = dh - frameH;
  return {
    ...crop,
    x: spareX > 0.5 ? clamp(crop.x - moveX / spareX, 0, 1) : crop.x,
    y: spareY > 0.5 ? clamp(crop.y - moveY / spareY, 0, 1) : crop.y,
  };
}

/** Zoom to a new level keeping the photo's point under (atX, atY) where it
 *  is, as a pinch or a wheel does. Without a point it zooms about the middle
 *  of the frame. */
export function zoomCrop(crop, zoom, frameW, frameH, imageW, imageH, atX = frameW / 2, atY = frameH / 2) {
  const next = clamp(zoom, CROP.minZoom, CROP.maxZoom);
  const before = coverRect(frameW, frameH, imageW, imageH, crop);
  const u = (atX - before.dx) / before.dw, v = (atY - before.dy) / before.dh;
  const after = coverRect(frameW, frameH, imageW, imageH, { ...crop, zoom: next });
  const place = (at, part, size, frame, keep) => (Math.abs(frame - size) < 0.5 ? keep : clamp((at - part * size) / (frame - size), 0, 1));
  return { x: place(atX, u, after.dw, frameW, crop.x), y: place(atY, v, after.dh, frameH, crop.y), zoom: next };
}

/** A frame's width over its height for a w by h photo on a grid gridWidth
 *  wide (six columns, rows a tenth of the width less a share of the gaps). */
export function frameAspect(w, h, gridWidth, gap = GRID_GAP) {
  const column = (gridWidth - gap * 5) / 6, row = gridWidth / 10 - (gap * 5) / 6;
  return (w * column + (w - 1) * gap) / (h * row + (h - 1) * gap);
}

/** The frame shapes the pop-up offers, width over height. */
export const SHAPES = [['cinema', 'Cinema', 2.39], ['wide', 'Wide', 16 / 9], ['classic', 'Classic', 4 / 3], ['square', 'Square', 1]];

/** The number of rows (2 to 10) that brings a w-column photo closest to a
 *  shape's ratio. */
export function rowsForShape(w, ratio, gridWidth, gap = GRID_GAP) {
  let best = 2;
  for (let h = 2; h <= 10; h += 1) if (Math.abs(frameAspect(w, h, gridWidth, gap) - ratio) < Math.abs(frameAspect(w, best, gridWidth, gap) - ratio)) best = h;
  return best;
}

/** The crop presets: how much of the photo the frame shows. */
export const CROP_SIZES = [['Full', 1], ['3/4', 4 / 3], ['Half', 2], ['Third', 3]];
