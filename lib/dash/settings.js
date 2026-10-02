// Dash settings: one small key/value table. `theme` is the active theme id,
// `layouts` holds a saved layout per theme id. Other keys (a widget's own
// setting, like money_goal_pence) go through readSetting/writeSetting.
// Values are JSON; a row that no longer parses reads as missing.
import { DEFAULT_THEME, isTheme } from './themes.js';

export function ensureDashSettings(db) {
  db.exec('CREATE TABLE IF NOT EXISTS dash_settings (key TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL)');
}

const KEY = /^[a-z][a-z0-9_]{0,63}$/;
const iso = value => (value instanceof Date ? value : new Date(value || Date.now())).toISOString();

export function readSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT json FROM dash_settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.json); } catch { return fallback; }
}

export function writeSetting(db, key, value, now) {
  if (!KEY.test(key ?? '')) throw new Error('Use a lower-case setting key.');
  if (value === undefined) throw new Error('Give the setting a value.');
  db.prepare('INSERT INTO dash_settings (key, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at')
    .run(key, JSON.stringify(value), iso(now));
}

const plainObject = value => value && typeof value === 'object' && !Array.isArray(value);

/** { theme, layouts } with defaults: an unknown theme reads as the default,
 *  and only layouts of known themes come back. Layout contents are validated
 *  by the caller against the widget registry (lib/dash/layout.js). */
export function readSettings(db) {
  const theme = readSetting(db, 'theme');
  const stored = readSetting(db, 'layouts');
  const layouts = {};
  if (plainObject(stored)) for (const [id, layout] of Object.entries(stored)) if (isTheme(id) && plainObject(layout)) layouts[id] = layout;
  return { theme: isTheme(theme) ? theme : DEFAULT_THEME, layouts };
}

/** Save the theme, the whole layouts map, or one theme's layout. A layout of
 *  null removes the saved one, so that theme falls back to its default. */
export function writeSettings(db, { theme, layouts, layout, layoutTheme } = {}, now) {
  db.transaction(() => {
    if (theme !== undefined) {
      if (!isTheme(theme)) throw new Error('Unknown theme.');
      writeSetting(db, 'theme', theme, now);
    }
    if (layouts !== undefined) {
      if (!plainObject(layouts)) throw new Error('Layouts must be an object.');
      writeSetting(db, 'layouts', layouts, now);
    }
    if (layoutTheme !== undefined) {
      if (!isTheme(layoutTheme)) throw new Error('Unknown theme.');
      const next = { ...readSettings(db).layouts };
      if (layout === null) delete next[layoutTheme];
      else if (plainObject(layout)) next[layoutTheme] = layout;
      else throw new Error('Send the layout as an object.');
      writeSetting(db, 'layouts', next, now);
    }
  })();
  return readSettings(db);
}
