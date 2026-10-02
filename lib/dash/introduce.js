// New widgets reach layouts you already saved: once per widget, placed
// where the theme default puts it (after a named neighbour), then marked as
// introduced so a later removal in Customise stands. Layouts that were never
// saved already follow the theme default and need nothing.
import { readSetting, writeSetting } from './settings.js';
import { findWidget, validateLayout } from './layout.js';

export const INTRODUCED = Object.freeze([]);
const KEY = 'introduced_widgets';

function place(layout, { id, zone, after }, widgets) {
  if (findWidget(layout, id)) return layout;
  const next = { ...layout, [zone]: [...(layout[zone] || [])] };
  const at = next[zone].findIndex(item => item.id === after);
  next[zone].splice(at >= 0 ? at + 1 : next[zone].length, 0, { id });
  return validateLayout(next, widgets);
}

export function introduceWidgets(db, widgets, now = new Date()) {
  const done = new Set(readSetting(db, KEY, []) || []);
  const pending = INTRODUCED.filter(item => !done.has(item.id) && widgets[item.id]);
  if (!pending.length) return false;
  const layouts = readSetting(db, 'layouts', null);
  if (layouts && typeof layouts === 'object') {
    const next = {};
    for (const [theme, layout] of Object.entries(layouts)) next[theme] = pending.reduce((acc, item) => place(acc, item, widgets), layout);
    writeSetting(db, 'layouts', next, now);
  }
  writeSetting(db, KEY, [...done, ...pending.map(item => item.id)], now);
  return true;
}
