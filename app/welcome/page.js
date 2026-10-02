// Onboarding: the first page a new Mythic shows. Once it is done the Dash is
// the home page; /welcome?again=1 runs it again (it adds, it never removes).
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db.js';
import { readProfile } from '@/lib/profile.js';
import { HABIT_IDEAS, MAX_PROJECTS, MAX_TASKS } from '@/lib/onboarding.js';
import { HABIT_COUNT } from '@/lib/simple/habits.js';
import Welcome from '@/components/welcome/Welcome.jsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Welcome · Mythic' };

export default async function WelcomePage({ searchParams }) {
  const profile = readProfile(getDb());
  const again = (await searchParams)?.again === '1';
  if (profile.onboarded_at && !again) redirect('/dash');
  return <Welcome profile={{ name: profile.name, timezone: profile.onboarded_at ? profile.timezone : null }}
    ideas={HABIT_IDEAS} limits={{ projects: MAX_PROJECTS, tasks: MAX_TASKS, habits: HABIT_COUNT }} />;
}
