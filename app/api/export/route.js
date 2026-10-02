// Everything you put into Mythic as one JSON file: tasks, projects, habits
// and their ticks, notes, sleep, settings. Secrets (the Telegram bot token,
// the API token's hash, calendar addresses) are left out.
import { getDb } from '@/lib/db.js';
import { readTasks } from '@/lib/tasks/store.js';
import { ensureProjects } from '@/lib/simple/projects.js';
import { ensureHabits } from '@/lib/simple/habits.js';
import { ensureNotes } from '@/lib/notes.js';
import { ensureSleep } from '@/lib/dash/sleep.js';
import { readProfile } from '@/lib/profile.js';
import { localToday } from '@/lib/day.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const db = getDb();
  ensureProjects(db); ensureHabits(db); ensureNotes(db); ensureSleep(db);
  const all = sql => db.prepare(sql).all();
  const body = {
    exported_at: new Date().toISOString(),
    profile: readProfile(db),
    tasks: Object.values(readTasks(db).tasks_by_id),
    projects: all('SELECT * FROM projects'),
    habits: all('SELECT * FROM habits'),
    habit_checks: all('SELECT habit_id, day, checked_at FROM habit_checks ORDER BY day'),
    notes: all('SELECT * FROM notes WHERE deleted_at IS NULL'),
    sleep: all('SELECT * FROM sleep_nights ORDER BY day'),
  };
  return new Response(JSON.stringify(body, null, 2), { headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="mythic-${localToday()}.json"`,
  } });
}
