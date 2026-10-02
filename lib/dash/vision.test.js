import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureVision, sniffImage, visionStamp, addVision, listVision, reorderVision, removeVision, visionFile, visionView, visionDir,
  MAX_VISION_BYTES, VISION_GRID, clampVisionSize, layoutVision, clampVisionCrop, frameVision,
} from './vision.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(60, 3)]);

function setup() {
  const db = new Database(':memory:');
  ensureVision(db);
  const dir = mkdtempSync(join(tmpdir(), 'dash-vision-'));
  return { db, dir, done: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test('the image type comes from the magic bytes only', () => {
  assert.deepEqual(sniffImage(JPEG), { ext: 'jpg', mime: 'image/jpeg' });
  assert.deepEqual(sniffImage(PNG), { ext: 'png', mime: 'image/png' });
  assert.deepEqual(sniffImage(WEBP), { ext: 'webp', mime: 'image/webp' });
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(sniffImage(Buffer.from('GIF89a......')), null);
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8])), null);
  assert.deepEqual(sniffImage(new Uint8Array(JPEG)), { ext: 'jpg', mime: 'image/jpeg' });
});

test('the stamp prints the day like a disposable camera', () => {
  assert.equal(visionStamp('2026-09-20'), "20 9 '26");
  assert.equal(visionStamp('2026-11-02'), "02 11 '26");
  assert.equal(visionStamp('2027-03-14'), "14 3 '27");
  assert.throws(() => visionStamp('20/9/26'), /YYYY-MM-DD/);
});

test('the photo directory sits under the data dir', () => {
  assert.equal(visionDir('/data'), '/data/dash/vision');
  // By default the data dir is MYTHIC_DATA_DIR (lib/paths.js).
  const before = process.env.MYTHIC_DATA_DIR;
  try {
    process.env.MYTHIC_DATA_DIR = '/srv/mythic-data';
    assert.equal(visionDir(), '/srv/mythic-data/dash/vision');
  } finally {
    if (before === undefined) delete process.env.MYTHIC_DATA_DIR; else process.env.MYTHIC_DATA_DIR = before;
  }
});

test('a photo is written under its own id and listed in order', () => {
  const { db, dir, done } = setup();
  try {
    const a = addVision(db, { bytes: JPEG, today: '2026-09-23', now: new Date('2026-09-23T10:00:00Z'), dir });
    const b = addVision(db, { bytes: PNG, today: '2026-09-24', dir });
    assert.equal(a.file, a.id + '.jpg');
    assert.equal(b.file, b.id + '.png');
    assert.equal(a.stamp, "23 9 '26");
    assert.deepEqual(readFileSync(join(dir, a.file)), JPEG);
    assert.deepEqual(readdirSync(dir).sort(), [a.file, b.file].sort(), 'no temporary files are left behind');
    assert.deepEqual(listVision(db).map(row => row.id), [a.id, b.id]);
    assert.deepEqual(visionView(db), { items: [
      { id: a.id, src: `/api/vision?file=${a.id}`, stamp: "23 9 '26", w: 6, h: 6, x: 0.5, y: 0.5, zoom: 1 },
      { id: b.id, src: `/api/vision?file=${b.id}`, stamp: "24 9 '26", w: 6, h: 6, x: 0.5, y: 0.5, zoom: 1 },
    ] });
  } finally { done(); }
});

test('bad uploads are refused and leave nothing on disk', () => {
  const { db, dir, done } = setup();
  try {
    assert.throws(() => addVision(db, { bytes: Buffer.alloc(0), today: '2026-09-23', dir }), /Choose a photo/);
    assert.throws(() => addVision(db, { bytes: Buffer.from('<svg></svg> not an image at all'), today: '2026-09-23', dir }), /JPEG, PNG or WebP/);
    const big = Buffer.alloc(MAX_VISION_BYTES + 1); JPEG.copy(big);
    assert.throws(() => addVision(db, { bytes: big, today: '2026-09-23', dir }), /8 MB/);
    assert.equal(listVision(db).length, 0);
    assert.equal(existsSync(dir) ? readdirSync(dir).length : 0, 0);
  } finally { done(); }
});

test('the board holds six photos', () => {
  const { db, dir, done } = setup();
  try {
    for (let n = 0; n < 6; n += 1) addVision(db, { bytes: WEBP, today: '2026-09-23', dir });
    assert.throws(() => addVision(db, { bytes: WEBP, today: '2026-09-23', dir }), /six photos/);
    assert.equal(readdirSync(dir).length, 6);
  } finally { done(); }
});

test('reorder needs every photo once', () => {
  const { db, dir, done } = setup();
  try {
    const ids = [JPEG, PNG, WEBP].map(bytes => addVision(db, { bytes, today: '2026-09-23', dir }).id);
    reorderVision(db, [ids[2], ids[0], ids[1]]);
    assert.deepEqual(listVision(db).map(row => row.id), [ids[2], ids[0], ids[1]]);
    assert.throws(() => reorderVision(db, [ids[0], ids[1]]), /every photo once/);
    assert.throws(() => reorderVision(db, [ids[0], ids[0], ids[1]]), /every photo once/);
    assert.throws(() => reorderVision(db, [ids[0], ids[1], 'ghost']), /every photo once/);
  } finally { done(); }
});

test('remove deletes the row and the file; the file lookup only knows rows', () => {
  const { db, dir, done } = setup();
  try {
    const a = addVision(db, { bytes: JPEG, today: '2026-09-23', dir });
    assert.deepEqual(visionFile(db, a.id, { dir }), { path: join(dir, a.file), mime: 'image/jpeg' });
    assert.equal(visionFile(db, '../../etc/passwd', { dir }), null);
    assert.equal(visionFile(db, '00000000-0000-4000-8000-000000000000', { dir }), null);
    removeVision(db, a.id, { dir });
    assert.equal(existsSync(join(dir, a.file)), false);
    assert.equal(listVision(db).length, 0);
    assert.equal(visionFile(db, a.id, { dir }), null);
    assert.throws(() => removeVision(db, a.id, { dir }), /no longer on the board/);
  } finally { done(); }
});

test('a board made before sizes gains w and h at the full-width default', () => {
  const db = new Database(':memory:');
  db.exec("CREATE TABLE vision_items (id TEXT PRIMARY KEY, file TEXT NOT NULL, stamp TEXT NOT NULL, position INTEGER NOT NULL, created_at TEXT NOT NULL)");
  db.prepare("INSERT INTO vision_items VALUES ('11111111-1111-4111-8111-111111111111', 'x.jpg', '1 1 ''26', 0, '2026-01-01T00:00:00Z')").run();
  ensureVision(db);
  ensureVision(db);
  const [row] = listVision(db);
  assert.equal(row.w, VISION_GRID.defaultW);
  assert.equal(row.h, VISION_GRID.defaultH);
  assert.deepEqual(visionView(db).items[0].w, 6);
  db.close();
});

test('sizes are held to the grid and junk is refused', () => {
  assert.deepEqual(clampVisionSize(3, 4), { w: 3, h: 4 });
  assert.deepEqual(clampVisionSize(1, 1), { w: 2, h: 2 });
  assert.deepEqual(clampVisionSize(9, 40), { w: 6, h: 10 });
  assert.deepEqual(clampVisionSize('4', '5'), { w: 4, h: 5 });
  assert.deepEqual(clampVisionSize(3.6, 2.2), { w: 4, h: 2 });
  assert.throws(() => clampVisionSize(null, 3), /width and height/);
  assert.throws(() => clampVisionSize(3, 'tall'), /width and height/);
  assert.throws(() => clampVisionSize(Infinity, 3), /width and height/);
});

test('layout saves order and sizes together, and needs every photo once', () => {
  const { db, dir, done } = setup();
  try {
    const a = addVision(db, { bytes: JPEG, today: '2026-09-23', dir });
    const b = addVision(db, { bytes: PNG, today: '2026-09-23', dir });
    const c = addVision(db, { bytes: WEBP, today: '2026-09-23', dir });
    const saved = layoutVision(db, [{ id: c.id, w: 3, h: 4 }, { id: a.id, w: 3, h: 4 }, { id: b.id, w: 12, h: 1 }]);
    assert.deepEqual(saved.map(item => [item.w, item.h]), [[3, 4], [3, 4], [6, 2]]);
    assert.deepEqual(visionView(db).items.map(item => [item.id, item.w, item.h]), [[c.id, 3, 4], [a.id, 3, 4], [b.id, 6, 2]]);
    const before = JSON.stringify(listVision(db));
    assert.throws(() => layoutVision(db, [{ id: a.id, w: 3, h: 3 }]), /every photo once/);
    assert.throws(() => layoutVision(db, [{ id: a.id, w: 3, h: 3 }, { id: a.id, w: 3, h: 3 }, { id: b.id, w: 3, h: 3 }]), /every photo once/);
    assert.throws(() => layoutVision(db, [{ id: a.id, w: 3, h: 3 }, { id: b.id, w: 3, h: 3 }, { id: 'nope', w: 3, h: 3 }]), /every photo once/);
    assert.throws(() => layoutVision(db, [{ id: a.id, w: 3, h: 3 }, { id: b.id, w: 3, h: 3 }, { id: c.id, w: 'x', h: 3 }]), /width and height/);
    assert.equal(JSON.stringify(listVision(db)), before);
    reorderVision(db, [a.id, b.id, c.id]);
    assert.deepEqual(visionView(db).items.map(item => item.w), [3, 6, 3]);
  } finally { done(); }
});

test('a board made before crops gains a centred, whole-photo crop', () => {
  const db = new Database(':memory:');
  db.exec("CREATE TABLE vision_items (id TEXT PRIMARY KEY, file TEXT NOT NULL, stamp TEXT NOT NULL, position INTEGER NOT NULL, created_at TEXT NOT NULL, w INTEGER NOT NULL DEFAULT 6, h INTEGER NOT NULL DEFAULT 6)");
  db.prepare("INSERT INTO vision_items (id, file, stamp, position, created_at) VALUES ('11111111-1111-4111-8111-111111111111', 'x.jpg', '1 1 ''26', 0, '2026-01-01T00:00:00Z')").run();
  ensureVision(db);
  ensureVision(db);
  const [item] = visionView(db).items;
  assert.deepEqual([item.x, item.y, item.zoom], [0.5, 0.5, 1]);
  db.close();
});

test('crops are held to their range and junk is refused', () => {
  assert.deepEqual(clampVisionCrop({ x: 0.2, y: 0.8, zoom: 1.5 }), { x: 0.2, y: 0.8, zoom: 1.5 });
  assert.deepEqual(clampVisionCrop({ x: -1, y: 4, zoom: 9 }), { x: 0, y: 1, zoom: 3 });
  assert.deepEqual(clampVisionCrop({ x: '0.25', y: '0.5', zoom: '0.4' }), { x: 0.25, y: 0.5, zoom: 1 });
  assert.deepEqual(clampVisionCrop({ x: 1 / 3, y: 0.5, zoom: 1 }), { x: 0.3333, y: 0.5, zoom: 1 });
  assert.throws(() => clampVisionCrop({ x: 0.5, y: null, zoom: 1 }), /zoomed/);
  assert.throws(() => clampVisionCrop({ x: 0.5, y: 0.5, zoom: NaN }), /zoomed/);
});

test('framing saves the crop, and the size only when it is sent', () => {
  const { db, dir, done } = setup();
  try {
    const a = addVision(db, { bytes: JPEG, today: '2026-09-23', dir });
    assert.deepEqual(frameVision(db, a.id, { x: 0.1, y: 0.9, zoom: 2 }), { id: a.id, x: 0.1, y: 0.9, zoom: 2, w: 6, h: 6 });
    assert.deepEqual(frameVision(db, a.id, { x: 0.1, y: 0.9, zoom: 2, w: 3, h: 12 }), { id: a.id, x: 0.1, y: 0.9, zoom: 2, w: 3, h: 10 });
    const [item] = visionView(db).items;
    assert.deepEqual([item.x, item.y, item.zoom, item.w, item.h], [0.1, 0.9, 2, 3, 10]);
    assert.throws(() => frameVision(db, '22222222-2222-4222-8222-222222222222', { x: 0.5, y: 0.5, zoom: 1 }), /no longer on the board/);
    assert.throws(() => frameVision(db, a.id, { x: 0.5, y: 0.5, zoom: 1, w: 'wide', h: 3 }), /width and height/);
    layoutVision(db, [{ id: a.id, w: 4, h: 4 }]);
    const [after] = visionView(db).items;
    assert.deepEqual([after.x, after.y, after.zoom], [0.1, 0.9, 2], 'a layout save keeps the crop');
  } finally { done(); }
});
