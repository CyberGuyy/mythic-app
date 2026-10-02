// Who the Dash is for: a first name, the timezone the day is counted in, and
// whether onboarding is done. Kept in the settings table; every server page
// and route calls applyProfile first, so the day boundary is right everywhere.
import { ensureDashSettings, readSetting, writeSetting } from './dash/settings.js';
import { setTimeZone, validZone } from './day.js';

const KEY = 'profile';

export function readProfile(db) {
  ensureDashSettings(db);
  const stored = readSetting(db, KEY, {}) || {};
  return {
    name: typeof stored.name === 'string' ? stored.name : '',
    timezone: validZone(stored.timezone) ? stored.timezone : (validZone(process.env.MYTHIC_TIMEZONE) ? process.env.MYTHIC_TIMEZONE : 'UTC'),
    onboarded_at: typeof stored.onboarded_at === 'string' ? stored.onboarded_at : null,
  };
}

/** Read the profile and set the day's timezone from it. */
export function applyProfile(db) {
  const profile = readProfile(db);
  setTimeZone(profile.timezone);
  return profile;
}

export function writeProfile(db, patch, now = new Date()) {
  const current = readProfile(db);
  const next = { ...current };
  if (patch.name !== undefined) {
    const name = String(patch.name || '').replace(/\s+/g, ' ').trim();
    if (name.length > 40) throw new Error('Keep the name under 40 characters.');
    next.name = name;
  }
  if (patch.timezone !== undefined) {
    if (!validZone(patch.timezone)) throw new Error('Choose a timezone from the list.');
    next.timezone = patch.timezone;
  }
  if (patch.onboarded === true) next.onboarded_at = current.onboarded_at || now.toISOString();
  if (patch.onboarded === false) next.onboarded_at = null;
  writeSetting(db, KEY, next, now);
  setTimeZone(next.timezone);
  return next;
}
