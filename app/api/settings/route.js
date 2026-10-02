import { getDb } from '@/lib/db.js';
import { THEMES, isTheme } from '@/lib/dash/themes.js';
import { WIDGETS } from '@/lib/dash/widgets.js';
import { validateLayout, resolveLayout } from '@/lib/dash/layout.js';
import { ensureDashSettings, readSettings, writeSettings } from '@/lib/dash/settings.js';

import { RouteError, jsonRoute } from '@/lib/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const need = (condition, message) => { if (!condition) throw new RouteError(message); };
const wrap = call => { try { return call(); } catch (error) { throw new RouteError(error.message); } };
const settingsDb = () => { const db = getDb(); ensureDashSettings(db); return db; };

/** The active theme and the layout every theme shows (saved, else default). */
function current(db) {
  const { theme, layouts } = readSettings(db);
  return { theme, layouts: Object.fromEntries(Object.keys(THEMES).map(id => [id, resolveLayout(layouts, id, WIDGETS)])) };
}

export async function GET(request) {
  try {
    return Response.json(current(settingsDb()), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 503;
    return Response.json({ error: error?.message || 'Dash settings are unavailable' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const POST = jsonRoute(async body => {
  const db = settingsDb();
  const { action } = body;

  if (action === 'theme') {
    need(isTheme(body.theme), 'Choose one of the themes.');
    wrap(() => writeSettings(db, { theme: body.theme }, new Date()));
    return { ok: true, theme: body.theme };
  }
  if (action === 'layout') {
    need(isTheme(body.theme), 'Choose one of the themes.');
    need(body.layout && typeof body.layout === 'object' && !Array.isArray(body.layout), 'Send the layout as an object.');
    const layout = validateLayout(body.layout, WIDGETS);
    wrap(() => writeSettings(db, { layoutTheme: body.theme, layout }, new Date()));
    return { ok: true, layout };
  }
  if (action === 'reset') {
    need(isTheme(body.theme), 'Choose one of the themes.');
    wrap(() => writeSettings(db, { layoutTheme: body.theme, layout: null }, new Date()));
    return { ok: true, layout: resolveLayout({}, body.theme, WIDGETS) };
  }
  throw new RouteError('Unknown action.');
});
