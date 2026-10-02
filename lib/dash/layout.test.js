import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES } from './themes.js';
import { WIDGETS, widgetMeta } from './widgets.js';
import { validateLayout, moveWidget, addWidget, removeWidget, defaultLayout, resolveLayout, findWidget, offPage } from './layout.js';

const meta = widgetMeta();
const ids = zone => zone.map(item => item.id);

test('every theme default is already a valid layout and uses every widget', () => {
  for (const theme of Object.values(THEMES)) {
    assert.deepEqual(validateLayout(theme.layout, WIDGETS), theme.layout, theme.id);
    const used = [...theme.layout.top, ...theme.layout.left, ...theme.layout.right].map(item => item.id).sort();
    assert.deepEqual(used, Object.keys(WIDGETS).sort(), theme.id);
  }
  const yoru = defaultLayout('yoru', meta);
  assert.deepEqual(ids(yoru.top), ['header', 'flower', 'habits', 'yearline']);
  assert.deepEqual(ids(yoru.left), ['vision', 'sleep']);
  assert.deepEqual(ids(yoru.right), ['tasks', 'today', 'notes', 'calendar']);
  assert.deepEqual(defaultLayout('no-such-theme', meta), defaultLayout('yoru', meta));
});

test('validation drops unknown ids, repeats and wrong zones, and restores required widgets', () => {
  const out = validateLayout({
    top: ['header', { id: 'ghost' }, { id: 'tasks' }, 7, null],
    left: [{ id: 'vision', options: { rows: 2 } }, { id: 'vision' }, { id: 'calendar' }],
    right: [{ id: 'calendar' }, { id: 'notes', options: [1] }],
    extra: [{ id: 'sleep' }],
  }, meta);
  // The flower is not required, so a layout without it stays without it.
  assert.deepEqual(out.top.map(item => item.id), ['header']);
  assert.deepEqual(out.left, [{ id: 'vision', options: { rows: 2 } }]);
  // tasks was in the top, which it may not use, so it comes back in its own zone;
  // the calendar stays last and array options are not options.
  assert.deepEqual(out.right, [{ id: 'notes' }, { id: 'tasks' }, { id: 'calendar' }]);
  for (const junk of [null, 'x', [], 42]) assert.deepEqual(validateLayout(junk, meta), { top: [], left: [], right: [{ id: 'tasks' }] });
  assert.throws(() => validateLayout({}), /registry/);
});

test('moving reorders within a zone and crosses to an allowed zone only', () => {
  const start = defaultLayout('yoru', meta);
  const up = moveWidget(start, 'notes', 'right', 1, meta);
  assert.deepEqual(ids(up.right), ['tasks', 'notes', 'today', 'calendar']);
  assert.deepEqual(ids(start.right), ['tasks', 'today', 'notes', 'calendar'], 'the input is not mutated');
  const down = moveWidget(start, 'vision', 'left', 1, meta);
  assert.deepEqual(ids(down.left), ['sleep', 'vision']);
  const across = moveWidget(start, 'today', 'left', 0, meta);
  assert.deepEqual(ids(across.left), ['today', 'vision', 'sleep']);
  assert.deepEqual(ids(across.right), ['tasks', 'notes', 'calendar']);
  const toEnd = moveWidget(start, 'tasks', 'right', Infinity, meta);
  assert.deepEqual(ids(toEnd.right), ['today', 'notes', 'tasks', 'calendar'], 'the calendar stays last');
  const pinned = moveWidget(start, 'calendar', 'right', 0, meta);
  assert.deepEqual(ids(pinned.right), ['tasks', 'today', 'notes', 'calendar']);
  const clamped = moveWidget(start, 'sleep', 'left', -4, meta);
  assert.deepEqual(ids(clamped.left), ['sleep', 'vision']);
  assert.throws(() => moveWidget(start, 'tasks', 'left', 0, meta), /cannot go in that zone/);
  assert.throws(() => moveWidget(start, 'ghost', 'left', 0, meta), /Unknown/);
  assert.throws(() => moveWidget(removeWidget(start, 'sleep', meta), 'sleep', 'left', 0, meta), /not on the page/);
});

test('adding and removing, with the required widget staying put', () => {
  const start = defaultLayout('yoru', meta);
  const without = removeWidget(start, 'sleep', meta);
  assert.equal(findWidget(without, 'sleep'), null);
  assert.deepEqual(offPage(without, meta).map(widget => widget.id), ['sleep']);
  const back = addWidget(without, 'sleep', 'right', meta);
  assert.deepEqual(ids(back.right), ['tasks', 'today', 'notes', 'sleep', 'calendar']);
  const moved = addWidget(back, 'sleep', 'left', meta);
  assert.deepEqual(findWidget(moved, 'sleep'), { zone: 'left', index: 1 });
  assert.equal([...moved.top, ...moved.left, ...moved.right].filter(item => item.id === 'sleep').length, 1);
  const defaultZone = addWidget(removeWidget(start, 'habits', meta), 'habits', undefined, meta, { max: 4 });
  assert.deepEqual(defaultZone.top.at(-1), { id: 'habits', options: { max: 4 } });
  assert.throws(() => addWidget(without, 'sleep', 'top', meta), /cannot go in that zone/);
  assert.throws(() => removeWidget(start, 'tasks', meta), /stays on the page/);
  assert.deepEqual(removeWidget(start, 'ghost', meta), start);
});

test('a saved layout wins over the theme default, per theme', () => {
  const saved = { yoru: { top: [{ id: 'flower' }], left: [], right: [{ id: 'tasks' }] } };
  assert.deepEqual(resolveLayout(saved, 'yoru', meta), saved.yoru);
  assert.deepEqual(resolveLayout({ atlas: saved.yoru }, 'yoru', meta), defaultLayout('yoru', meta), 'a stale Atlas layout is not Yoru\'s');
  assert.deepEqual(resolveLayout(null, 'yoru', meta), defaultLayout('yoru', meta));
});

test('a repeat in another zone loses to the first placement, and validation is stable', () => {
  const out = validateLayout({
    top: [{ id: 'header' }, { id: 'flower' }, { id: 'habits' }],
    left: [{ id: 'habits' }, { id: 'today' }],
    right: [{ id: 'calendar' }, { id: 'today' }, { id: 'habits' }, { id: 'vision' }, 'tasks', 'ghost'],
  }, meta);
  assert.deepEqual(ids(out.top), ['header', 'flower', 'habits']);
  assert.deepEqual(ids(out.left), ['today']);
  assert.deepEqual(ids(out.right), ['vision', 'tasks', 'calendar'], 'the calendar is pinned last wherever it was sent');
  assert.deepEqual(validateLayout(out, meta), out, 'a clean layout passes through unchanged');
});

test('the plate widgets can leave the top and come back; the flower stays in the top but can be removed', () => {
  const start = defaultLayout('yoru', meta);
  const out = moveWidget(start, 'habits', 'right', 1, meta);
  assert.deepEqual(ids(out.top), ['header', 'flower', 'yearline']);
  assert.deepEqual(ids(out.right), ['tasks', 'habits', 'today', 'notes', 'calendar']);
  const back = moveWidget(out, 'habits', 'top', 1, meta);
  assert.deepEqual(ids(back.top), ['header', 'habits', 'flower', 'yearline']);
  assert.throws(() => moveWidget(start, 'flower', 'right', 0, meta), /cannot go in that zone/);
  assert.throws(() => addWidget(removeWidget(start, 'yearline', meta), 'yearline', 'left', meta), /cannot go in that zone/);
  // The plate can be emptied: neither the flower nor the habits come back on validation.
  const empty = removeWidget(removeWidget(start, 'flower', meta), 'habits', meta);
  assert.deepEqual(ids(empty.top), ['header', 'yearline']);
  assert.deepEqual(validateLayout(empty, meta), empty);
  assert.deepEqual(offPage(empty, meta).map(widget => widget.id), ['flower', 'habits']);
});
