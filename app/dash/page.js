// The Dash: every widget on the page loaded at once on the server (one
// failure only costs its own widget), then handed to DashShell. Someone who
// has not been through onboarding is sent there first.
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db.js';
import { readTasks } from '@/lib/tasks/store.js';
import { localToday } from '@/lib/day.js';
import { applyProfile } from '@/lib/profile.js';
import { WIDGETS, widgetMeta, loadWidgets } from '@/lib/dash/widgets.js';
import { resolveLayout } from '@/lib/dash/layout.js';
import { ensureDashSettings, readSettings } from '@/lib/dash/settings.js';
import { introduceWidgets } from '@/lib/dash/introduce.js';
import { refreshStaleFeeds } from '@/lib/connectors/calendar.js';
import { importHealthSleep } from '@/lib/dash/health-sleep.js';
import { telegramStatus } from '@/lib/connectors/telegram.js';
import DashShell from '@/components/dash/DashShell.jsx';

export const dynamic = 'force-dynamic';

export default async function DashPage() {
  const db = getDb();
  ensureDashSettings(db);
  const profile = applyProfile(db);
  if (!profile.onboarded_at) redirect('/welcome');
  // Calendars older than a quarter of an hour are fetched in the background;
  // the next load shows what came back.
  refreshStaleFeeds(db).catch(() => {});
  try { importHealthSleep(db); } catch { /* the Sleep widget says what it has */ }
  const widgets = widgetMeta(WIDGETS);
  introduceWidgets(db, widgets);
  const { theme, layouts } = readSettings(db);
  const layout = resolveLayout(layouts, theme, widgets);
  const now = new Date();
  let state = null;
  try { state = readTasks(db); } catch { state = null; }
  const data = await loadWidgets(layout, { db, state, now, today: localToday(now) });
  return <DashShell theme={theme} layout={layout} widgets={widgets} data={data} profile={{ name: profile.name, timezone: profile.timezone, reminders: !!telegramStatus(db).linked }} />;
}
