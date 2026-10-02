import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureDashSettings, readSettings, writeSettings, readSetting, writeSetting } from './settings.js';
import { DEFAULT_THEME, themeIds, themeOf } from './themes.js';

const fresh = () => { const db = new Database(':memory:'); ensureDashSettings(db); ensureDashSettings(db); return db; };
const now = new Date('2026-09-23T09:00:00Z');
const layout = { top: [{ id: 'flower' }], left: [], right: [{ id: 'tasks' }] };

test('Yoru is the only theme and the default', () => {
  assert.deepEqual(themeIds(), ['yoru']);
  assert.equal(DEFAULT_THEME, 'yoru');
  assert.equal(themeOf('atlas').id, 'yoru');
});

test('an empty table reads as the default theme and no saved layouts', () => {
  assert.deepEqual(readSettings(fresh()), { theme: 'yoru', layouts: {} });
});

test('a saved Atlas setting reads as Yoru and its layout is dropped', () => {
  const db = fresh();
  db.prepare("INSERT INTO dash_settings (key, json, updated_at) VALUES ('theme', '\"atlas\"', 'x'), ('layouts', ?, 'x')")
    .run(JSON.stringify({ atlas: { ...layout, left: [{ id: 'retired_widget' }] }, yoru: layout }));
  assert.deepEqual(readSettings(db), { theme: 'yoru', layouts: { yoru: layout } });
  assert.throws(() => writeSettings(db, { theme: 'atlas' }, now), /Unknown theme/);
  assert.throws(() => writeSettings(db, { layoutTheme: 'atlas', layout }, now), /Unknown theme/);
});

test('the theme and one layout per theme are saved and read back', () => {
  const db = fresh();
  assert.equal(writeSettings(db, { theme: 'yoru' }, now).theme, 'yoru');
  writeSettings(db, { layoutTheme: 'yoru', layout }, now);
  const read = readSettings(db);
  assert.equal(read.theme, 'yoru');
  assert.deepEqual(read.layouts.yoru, layout);
  assert.equal(db.prepare("SELECT updated_at FROM dash_settings WHERE key = 'theme'").get().updated_at, now.toISOString());
  const reset = writeSettings(db, { layoutTheme: 'yoru', layout: null }, now);
  assert.deepEqual(reset.layouts, {});
  writeSettings(db, { layouts: {} }, now);
  assert.deepEqual(readSettings(db).layouts, {});
});

test('bad values are refused and nothing half-saves', () => {
  const db = fresh();
  assert.throws(() => writeSettings(db, { theme: 'neon' }, now), /Unknown theme/);
  assert.throws(() => writeSettings(db, { layoutTheme: 'neon', layout }, now), /Unknown theme/);
  assert.throws(() => writeSettings(db, { layoutTheme: 'yoru', layout: [] }, now), /object/);
  assert.throws(() => writeSettings(db, { layouts: 'x' }, now), /object/);
  writeSettings(db, { theme: 'yoru' }, now);
  db.prepare("UPDATE dash_settings SET json = '\"retired\"' WHERE key = 'theme'").run();
  assert.throws(() => writeSettings(db, { theme: 'yoru', layouts: 'x' }, now), /object/);
  assert.equal(readSetting(db, 'theme'), 'retired', 'the theme in a failed write is rolled back');
});

test('stale or corrupt rows read as defaults', () => {
  const db = fresh();
  db.prepare("INSERT INTO dash_settings (key, json, updated_at) VALUES ('theme', '\"retired\"', 'x'), ('layouts', '{\"atlas\": 3, \"gone\": {}, \"yoru\": {\"top\": []}}', 'x')").run();
  assert.deepEqual(readSettings(db), { theme: 'yoru', layouts: { yoru: { top: [] } } });
  db.prepare("UPDATE dash_settings SET json = '{broken' WHERE key = 'layouts'").run();
  assert.deepEqual(readSettings(db).layouts, {});
});

test('other keys go through readSetting and writeSetting', () => {
  const db = fresh();
  assert.equal(readSetting(db, 'reading_goal_pages', 0), 0);
  writeSetting(db, 'reading_goal_pages', 500, now);
  assert.equal(readSetting(db, 'reading_goal_pages'), 500);
  assert.throws(() => writeSetting(db, 'Bad Key', 1), /key/);
  assert.throws(() => writeSetting(db, 'reading_goal_pages', undefined), /value/);
});
