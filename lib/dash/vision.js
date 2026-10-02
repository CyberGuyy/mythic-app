// The vision board: a few photos you picks himself, shown with the film look.
// Rows live in SQLite (vision_items); the files live under
// <dataDir>/dash/vision/<id>.<ext>. A file name is always built here from the
// row's own id and the type sniffed from the bytes, never from anything the
// client sends, so a request can only ever reach a file this module wrote.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { dataDir as defaultDataDir } from '../paths.js';

export const MAX_VISION_BYTES = 8 * 1024 * 1024;
export const MAX_VISION_ITEMS = 6;
// The board is a six-column grid; a photo spans w columns (2 to 6) and h rows
// (2 to 10). Six by six is the full-width 16:9.6 frame every photo had before
// sizes existed, so a board nobody has resized looks the same.
export const VISION_GRID = { columns: 6, minW: 2, maxW: 6, minH: 2, maxH: 10, defaultW: 6, defaultH: 6 };
// Each photo's crop inside its frame: x and y say where the frame looks (0 is
// the left or top edge of the photo, 1 the right or bottom, 0.5 the middle,
// like CSS object-position) and zoom how far in it is cropped (1 is the whole
// photo covering the frame, 3 a third of it).
export const VISION_CROP = { minZoom: 1, maxZoom: 3, x: 0.5, y: 0.5, zoom: 1 };
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const iso = value => (value instanceof Date ? value : new Date(value || Date.now())).toISOString();

export function ensureVision(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vision_items (id TEXT PRIMARY KEY, file TEXT NOT NULL, stamp TEXT NOT NULL, position INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_vision_items_position ON vision_items(position);
  `);
  // Sizes came after the first boards: add the columns to a table made before them.
  const columns = new Set(db.prepare('PRAGMA table_info(vision_items)').all().map(column => column.name));
  for (const name of ['w', 'h']) {
    if (!columns.has(name)) db.exec(`ALTER TABLE vision_items ADD COLUMN ${name} INTEGER NOT NULL DEFAULT 6`);
  }
  for (const [name, fallback] of [['crop_x', 0.5], ['crop_y', 0.5], ['zoom', 1]]) {
    if (!columns.has(name)) db.exec(`ALTER TABLE vision_items ADD COLUMN ${name} REAL NOT NULL DEFAULT ${fallback}`);
  }
}

const round = value => Math.round(value * 10000) / 10000;
/** A crop held to its range: x and y 0 to 1, zoom 1 to 3. Anything that is
 *  not a finite number is refused rather than guessed. */
export function clampVisionCrop({ x, y, zoom } = {}) {
  const numbers = [x, y, zoom].map(value => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value));
  if (!numbers.every(value => typeof value === 'number' && Number.isFinite(value))) throw new Error('Send where the photo sits and how far it is zoomed.');
  const [cx, cy, cz] = numbers;
  return { x: round(Math.min(1, Math.max(0, cx))), y: round(Math.min(1, Math.max(0, cy))), zoom: round(Math.min(VISION_CROP.maxZoom, Math.max(VISION_CROP.minZoom, cz))) };
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, Math.round(value)));

/** One photo's size held to the grid: w 2 to 6 columns, h 2 to 10 rows.
 *  Anything that is not a finite number is refused rather than guessed. */
export function clampVisionSize(w, h) {
  const width = typeof w === 'string' && w.trim() !== '' ? Number(w) : w;
  const height = typeof h === 'string' && h.trim() !== '' ? Number(h) : h;
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('Send a width and height for each photo.');
  }
  return { w: clamp(width, VISION_GRID.minW, VISION_GRID.maxW), h: clamp(height, VISION_GRID.minH, VISION_GRID.maxH) };
}

/** Where the photos live: <dataDir>/dash/vision. */
export function visionDir(dataDir = defaultDataDir()) {
  return path.join(/*turbopackIgnore: true*/ dataDir, 'dash', 'vision');
}

/** The image type from its first bytes (JPEG, PNG or WebP), or null. The
 *  declared MIME type of an upload is never trusted. */
export function sniffImage(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const b = Buffer.from(bytes.subarray(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: MIME.jpg };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: MIME.png };
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return { ext: 'webp', mime: MIME.webp };
  return null;
}

/** The date stamp in the corner of a photo, like a disposable camera prints
 *  it: day with two digits, month without, two-digit year. 2026-09-20 is
 *  "20 9 '26". */
export function visionStamp(day) {
  if (!DAY.test(day ?? '')) throw new Error('Use a YYYY-MM-DD day.');
  const [year, month, date] = day.split('-');
  return `${date} ${Number(month)} '${year.slice(2)}`;
}

export function listVision(db) {
  return db.prepare('SELECT id, file, stamp, position, w, h, crop_x, crop_y, zoom, created_at FROM vision_items ORDER BY position, created_at, id').all();
}

/** Save one photo: bytes checked (type by magic bytes, at most 8 MB), written
 *  to a temporary file and renamed into place, then the row. The board holds
 *  six photos; a seventh is refused rather than hidden. */
export function addVision(db, { bytes, today, now, dir = visionDir() } = {}) {
  if (!bytes || !bytes.length) throw new Error('Choose a photo to add.');
  if (bytes.length > MAX_VISION_BYTES) throw new Error('That photo is over 8 MB.');
  const kind = sniffImage(bytes);
  if (!kind) throw new Error('Use a JPEG, PNG or WebP photo.');
  const stamp = visionStamp(today);
  const count = db.prepare('SELECT COUNT(*) AS n FROM vision_items').get().n;
  if (count >= MAX_VISION_ITEMS) throw new Error('The board holds six photos. Remove one first.');

  const id = randomUUID(), file = `${id}.${kind.ext}`, target = path.join(/*turbopackIgnore: true*/ dir, file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temporary = target + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  try {
    const position = (db.prepare('SELECT MAX(position) AS p FROM vision_items').get().p ?? -1) + 1;
    db.prepare('INSERT INTO vision_items (id, file, stamp, position, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, file, stamp, position, iso(now));
  } catch (error) {
    fs.rmSync(target, { force: true });
    throw error;
  }
  return { id, file, stamp };
}

/** Put the photos in the given order. The list must name every photo once. */
export function reorderVision(db, ids) {
  const rows = listVision(db);
  if (!Array.isArray(ids) || ids.length !== rows.length || new Set(ids).size !== ids.length
    || !ids.every(id => rows.some(row => row.id === id))) throw new Error('Send every photo once, in the new order.');
  const update = db.prepare('UPDATE vision_items SET position = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, index) => update.run(index, id)))();
}

/** Save the whole layout at once: the order of `items` is the new order and
 *  each carries its size. The list must name every photo once; sizes are
 *  held to the grid. One transaction, so a failure changes nothing. */
export function layoutVision(db, items) {
  const rows = listVision(db);
  const known = new Set(rows.map(row => row.id));
  if (!Array.isArray(items) || items.length !== rows.length
    || !items.every(item => item && typeof item === 'object' && typeof item.id === 'string' && known.has(item.id))
    || new Set(items.map(item => item.id)).size !== items.length) throw new Error('Send every photo once, in the new order.');
  const sized = items.map(item => ({ id: item.id, ...clampVisionSize(item.w, item.h) }));
  const update = db.prepare('UPDATE vision_items SET position = ?, w = ?, h = ? WHERE id = ?');
  db.transaction(() => sized.forEach((item, index) => update.run(index, item.w, item.h, item.id)))();
  return sized;
}

/** Frame one photo: its crop, and its size when w and h are given (the
 *  frame's shape presets change the size). Returns the saved values. */
export function frameVision(db, id, { x, y, zoom, w, h } = {}) {
  const row = ID.test(id ?? '') ? db.prepare('SELECT id, w, h FROM vision_items WHERE id = ?').get(id) : null;
  if (!row) throw new Error('That photo is no longer on the board.');
  const crop = clampVisionCrop({ x, y, zoom });
  const size = w === undefined && h === undefined ? { w: row.w, h: row.h } : clampVisionSize(w, h);
  db.prepare('UPDATE vision_items SET crop_x = ?, crop_y = ?, zoom = ?, w = ?, h = ? WHERE id = ?').run(crop.x, crop.y, crop.zoom, size.w, size.h, id);
  return { id, ...crop, ...size };
}

/** Remove a photo and its file. */
export function removeVision(db, id, { dir = visionDir() } = {}) {
  const row = ID.test(id ?? '') ? db.prepare('SELECT file FROM vision_items WHERE id = ?').get(id) : null;
  if (!row) throw new Error('That photo is no longer on the board.');
  db.prepare('DELETE FROM vision_items WHERE id = ?').run(id);
  if (FILE.test(row.file)) fs.rmSync(path.join(/*turbopackIgnore: true*/ dir, row.file), { force: true });
}

/** The file behind one photo id, or null. The id must be a row in the table;
 *  the path is built from the stored file name, which this module made. */
export function visionFile(db, id, { dir = visionDir() } = {}) {
  if (!ID.test(id ?? '')) return null;
  const row = db.prepare('SELECT file FROM vision_items WHERE id = ?').get(id);
  if (!row || !FILE.test(row.file)) return null;
  return { path: path.join(/*turbopackIgnore: true*/ dir, row.file), mime: MIME[row.file.split('.').pop()] };
}

/** The loader's data: the first six photos in order. */
export function visionView(db) {
  return { items: listVision(db).slice(0, MAX_VISION_ITEMS).map(row => ({
    id: row.id, src: `/api/vision?file=${row.id}`, stamp: row.stamp,
    w: row.w ?? VISION_GRID.defaultW, h: row.h ?? VISION_GRID.defaultH,
    x: row.crop_x ?? VISION_CROP.x, y: row.crop_y ?? VISION_CROP.y, zoom: row.zoom ?? VISION_CROP.zoom,
  })) };
}
