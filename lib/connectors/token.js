// The personal API token: one secret that lets your own scripts, an iOS
// Shortcut or an automation service add tasks and read the list through
// /api/v1. Only a hash is kept; the token itself is shown once when made.
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { ensureDashSettings, readSetting, writeSetting } from '../dash/settings.js';

const KEY = 'api_token';
const PREFIX = 'myth_';
const hash = token => createHash('sha256').update(String(token)).digest('hex');

export function tokenStatus(db) {
  ensureDashSettings(db);
  const stored = readSetting(db, KEY, null);
  return stored?.hash ? { on: true, hint: stored.hint, created_at: stored.created_at, used_at: stored.used_at || null } : { on: false };
}

/** Make a new token (replacing any old one) and return it, once. */
export function issueToken(db, now = new Date()) {
  ensureDashSettings(db);
  const token = PREFIX + randomBytes(24).toString('base64url');
  writeSetting(db, KEY, { hash: hash(token), hint: token.slice(-4), created_at: now.toISOString() }, now);
  return token;
}

export function revokeToken(db, now = new Date()) {
  ensureDashSettings(db);
  writeSetting(db, KEY, {}, now);
}

/** True when the request carries the current token as a bearer token. */
export function checkToken(db, header, now = new Date()) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(header || '').trim());
  if (!match) return false;
  ensureDashSettings(db);
  const stored = readSetting(db, KEY, null);
  if (!stored?.hash) return false;
  const given = Buffer.from(hash(match[1]), 'hex'), real = Buffer.from(stored.hash, 'hex');
  if (given.length !== real.length || !timingSafeEqual(given, real)) return false;
  // When it was last used, at most once a minute.
  if (!stored.used_at || now - Date.parse(stored.used_at) > 60000) writeSetting(db, KEY, { ...stored, used_at: now.toISOString() }, now);
  return true;
}
