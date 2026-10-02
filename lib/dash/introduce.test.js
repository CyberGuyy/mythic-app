import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureDashSettings, readSetting, writeSetting } from './settings.js';
import { WIDGETS, widgetMeta } from './widgets.js';
import { INTRODUCED, introduceWidgets } from './introduce.js';

const widgets = widgetMeta(WIDGETS);
const saved = { top: [{ id: 'header' }, { id: 'flower' }, { id: 'habits' }, { id: 'yearline' }], left: [{ id: 'vision' }, { id: 'sleep' }], right: [{ id: 'tasks' }, { id: 'today' }, { id: 'notes' }, { id: 'calendar' }] };
const fresh = () => { const db = new Database(':memory:'); ensureDashSettings(db); return db; };

test('nothing is waiting to be introduced', () => {
  assert.deepEqual(INTRODUCED, []);
  assert.equal(Object.isFrozen(INTRODUCED), true);
});

test('with nothing to introduce, a saved layout is left exactly as it was and no marker is written', () => {
  const db = fresh();
  writeSetting(db, 'layouts', { yoru: saved });
  assert.equal(introduceWidgets(db, widgets), false);
  assert.deepEqual(readSetting(db, 'layouts'), { yoru: saved });
  assert.equal(readSetting(db, 'introduced_widgets', null), null);
});

test('with nothing to introduce and no saved layouts, nothing is written', () => {
  const db = fresh();
  assert.equal(introduceWidgets(db, widgets), false);
  assert.equal(readSetting(db, 'layouts', null), null);
  assert.equal(readSetting(db, 'introduced_widgets', null), null);
});
