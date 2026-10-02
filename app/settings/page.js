// Connections (/settings): you, your calendars, Telegram, the API token,
// Apple Health sleep, sign-in and your data. Read here, changed through
// /api/connections.
import { headers } from 'next/headers';
import { getDb } from '@/lib/db.js';
import { readProfile } from '@/lib/profile.js';
import { listFeeds } from '@/lib/connectors/calendar.js';
import { telegramStatus } from '@/lib/connectors/telegram.js';
import { tokenStatus } from '@/lib/connectors/token.js';
import { healthFiles, importHealthSleep } from '@/lib/dash/health-sleep.js';
import { password } from '@/lib/auth.js';
import { dataDir } from '@/lib/paths.js';
import Connections from '@/components/connections/Connections.jsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Connections · Mythic' };

export default async function SettingsPage() {
  const db = getDb();
  const profile = readProfile(db);
  let health;
  try { health = importHealthSleep(db); } catch (error) { health = { found: false, error: error.message }; }
  const head = await headers();
  const host = head.get('x-forwarded-host') || head.get('host') || 'localhost:3000';
  const proto = head.get('x-forwarded-proto') || 'http';
  return <Connections
    profile={{ name: profile.name, timezone: profile.timezone }}
    feeds={listFeeds(db)}
    telegram={telegramStatus(db)}
    token={tokenStatus(db)}
    health={{ found: !!health.found, error: health.error || null, nights: health.nights || 0, last_night: health.last_night || null, files: healthFiles() }}
    access={{ password: !!password(), data: dataDir(), origin: `${proto}://${host}` }} />;
}
