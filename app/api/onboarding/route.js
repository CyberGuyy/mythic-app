// Onboarding: the first-run flow's one save (lib/onboarding.js).
import { getDb } from '@/lib/db.js';
import { completeSetup } from '@/lib/onboarding.js';
import { jsonRoute, RouteError } from '@/lib/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = jsonRoute(async body => {
  try {
    return { ok: true, made: await completeSetup(getDb(), body) };
  } catch (error) {
    throw new RouteError(error.message);
  }
});
