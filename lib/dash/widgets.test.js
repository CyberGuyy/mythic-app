import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WIDGETS, widgetMeta, loadWidgets } from './widgets.js';
import { ICONS } from '../../components/dash/icons.js';

const ZONES = ['top', 'left', 'right'];

test('every widget entry is complete and consistent', () => {
  const index = readFileSync(new URL('../../components/dash/widgets/index.js', import.meta.url), 'utf8');
  const mapped = (index.match(/WIDGET_COMPONENTS\s*=\s*\{([^}]*)\}/) || [])[1] || '';
  const components = new Set(mapped.split(',').map(name => name.trim().split(':')[0].trim()).filter(Boolean));
  for (const [key, widget] of Object.entries(WIDGETS)) {
    assert.equal(widget.id, key);
    assert.ok(widget.name && typeof widget.name === 'string', key);
    assert.ok(ICONS[widget.icon], key + ' icon ' + widget.icon);
    assert.ok(widget.zones.length && widget.zones.every(zone => ZONES.includes(zone)), key);
    assert.ok(['main', 'side', 'full'].includes(widget.span), key);
    assert.equal(typeof widget.load, 'function', key);
    assert.ok(components.has(widget.component), key + ' is in WIDGET_COMPONENTS in widgets/index.js');
    assert.match(index, new RegExp('^import ' + widget.component + ' from ', 'm'), key + ' has an import in widgets/index.js');
  }
  assert.deepEqual(Object.keys(WIDGETS), ['header', 'flower', 'habits', 'yearline', 'tasks', 'today', 'notes', 'vision', 'sleep', 'calendar']);
  // Tasks is the only widget that cannot leave the page.
  assert.deepEqual(Object.values(WIDGETS).filter(widget => widget.required).map(widget => widget.id), ['tasks']);
});

test('the metadata is plain data with no loaders', () => {
  const meta = widgetMeta();
  assert.deepEqual(Object.keys(meta), Object.keys(WIDGETS));
  assert.equal(meta.tasks.load, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(meta)), meta);
  assert.equal(meta.calendar.pinLast, true);
});

test('loaders run together and one failure stays with its widget', async () => {
  const seen = [];
  const registry = {
    a: { id: 'a', load: async ctx => { seen.push(ctx); return { n: 1 }; } },
    b: { id: 'b', load: () => { throw new Error('No data file.'); } },
    c: { id: 'c', load: async () => undefined },
  };
  const layout = { top: [{ id: 'a', options: { x: 1 } }], left: [{ id: 'b' }, { id: 'ghost' }], right: [{ id: 'c' }] };
  const data = await loadWidgets(layout, { db: 'db', state: null, now: 'now', today: '2026-09-23' }, registry);
  assert.deepEqual(data, { a: { ok: true, value: { n: 1 } }, b: { ok: false, error: 'No data file.' }, ghost: { ok: false, error: 'Unknown widget.' }, c: { ok: true, value: null } });
  assert.deepEqual(seen, [{ db: 'db', state: null, now: 'now', today: '2026-09-23', options: { x: 1 } }]);
  // The real registry: the header needs the planning state, so null is its error card.
  const real = await loadWidgets({ top: [{ id: 'header' }], left: [], right: [] }, { state: null, now: new Date('2026-09-23T09:00:00Z'), today: '2026-09-23' });
  assert.deepEqual(real, { header: { ok: false, error: 'Tasks are unavailable right now.' } });
});
