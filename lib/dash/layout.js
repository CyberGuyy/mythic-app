// Pure layout functions for Dash. A layout is { top, left, right }, each an
// ordered list of { id, options? }. Every function takes the widget metadata
// (lib/dash/widgets.js WIDGETS, or widgetMeta() on the client) as its last
// argument, returns a new layout and never mutates the one it was given.
// No SQLite and no loaders here, so client components import it too.
import { THEMES, DEFAULT_THEME } from './themes.js';

export const ZONES = ['top', 'left', 'right'];
export const ZONE_NAMES = { top: 'Top', left: 'Left', right: 'Right' };

function cleanItem(raw) {
  if (typeof raw === 'string') return { id: raw };
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  const options = raw.options;
  return options && typeof options === 'object' && !Array.isArray(options)
    ? { id: raw.id, options: JSON.parse(JSON.stringify(options)) }
    : { id: raw.id };
}

// Pinned widgets (the calendar) go to the end of their zone, in their order.
const pinLast = (items, widgets) => [...items.filter(item => !widgets[item.id]?.pinLast), ...items.filter(item => widgets[item.id]?.pinLast)];
const copy = layout => ({ top: [...layout.top], left: [...layout.left], right: [...layout.right] });

/** Make any stored value a usable layout: unknown ids and repeats dropped, a
 *  widget in a zone it may not use dropped, required widgets restored to their
 *  first zone, pinned widgets moved last. */
export function validateLayout(layout, widgets) {
  if (!widgets) throw new Error('Pass the widget registry.');
  const source = layout && typeof layout === 'object' && !Array.isArray(layout) ? layout : {};
  const seen = new Set();
  const out = { top: [], left: [], right: [] };
  for (const zone of ZONES) {
    for (const raw of Array.isArray(source[zone]) ? source[zone] : []) {
      const item = cleanItem(raw);
      const meta = item && widgets[item.id];
      if (!meta || seen.has(item.id) || !meta.zones.includes(zone)) continue;
      seen.add(item.id);
      out[zone].push(item);
    }
  }
  for (const meta of Object.values(widgets)) {
    if (meta.required && !seen.has(meta.id)) { out[meta.zones[0]].push({ id: meta.id }); seen.add(meta.id); }
  }
  for (const zone of ZONES) out[zone] = pinLast(out[zone], widgets);
  return out;
}

/** Where a widget sits: { zone, index }, or null when it is not on the page. */
export function findWidget(layout, id) {
  for (const zone of ZONES) {
    const index = (layout[zone] || []).findIndex(item => item.id === id);
    if (index >= 0) return { zone, index };
  }
  return null;
}

/** Put a widget in a zone at an index. The index counts positions after the
 *  widget has left its old place, is clamped to the zone, and a pinned widget
 *  still ends up last. */
export function moveWidget(layout, id, zone, index, widgets) {
  const meta = widgets?.[id];
  if (!meta) throw new Error('Unknown widget.');
  if (!ZONES.includes(zone) || !meta.zones.includes(zone)) throw new Error(meta.name + ' cannot go in that zone.');
  const at = findWidget(layout, id);
  if (!at) throw new Error(meta.name + ' is not on the page.');
  const next = copy(layout);
  const [item] = next[at.zone].splice(at.index, 1);
  const target = Math.max(0, Math.min(Number.isFinite(index) ? Math.trunc(index) : next[zone].length, next[zone].length));
  next[zone].splice(target, 0, item);
  next[zone] = pinLast(next[zone], widgets);
  return next;
}

/** Add a widget at the end of a zone (before a pinned one). A widget already
 *  on the page moves there instead of appearing twice. */
export function addWidget(layout, id, zone, widgets, options) {
  const meta = widgets?.[id];
  if (!meta) throw new Error('Unknown widget.');
  const place = zone || meta.zones[0];
  if (!ZONES.includes(place) || !meta.zones.includes(place)) throw new Error(meta.name + ' cannot go in that zone.');
  if (findWidget(layout, id)) return moveWidget(layout, id, place, Infinity, widgets);
  const next = copy(layout);
  next[place].push(options && typeof options === 'object' ? { id, options } : { id });
  next[place] = pinLast(next[place], widgets);
  return next;
}

/** Take a widget off the page. Required widgets refuse. */
export function removeWidget(layout, id, widgets) {
  const meta = widgets?.[id];
  if (meta?.required) throw new Error(meta.name + ' stays on the page.');
  const next = copy(layout);
  for (const zone of ZONES) next[zone] = next[zone].filter(item => item.id !== id);
  return next;
}

/** The layout a theme starts with, checked against the registry. */
export function defaultLayout(themeId, widgets) {
  return validateLayout((THEMES[themeId] || THEMES[DEFAULT_THEME]).layout, widgets);
}

/** The layout to show for a theme: the saved one, else the theme default. */
export function resolveLayout(layouts, themeId, widgets) {
  const saved = layouts && typeof layouts === 'object' ? layouts[themeId] : null;
  return saved ? validateLayout(saved, widgets) : defaultLayout(themeId, widgets);
}

/** The widgets not on the page, in registry order: what the drawer offers. */
export function offPage(layout, widgets) {
  return Object.values(widgets).filter(meta => !findWidget(layout, meta.id));
}
