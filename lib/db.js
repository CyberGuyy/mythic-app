// The one SQLite database (better-sqlite3, WAL). Each module creates its own
// tables with an ensure* function, so a fresh data folder needs no migration
// step. Tests pass their own in-memory database instead of calling getDb.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { dbPath } from './paths.js';

let db = null;
let openPath = null;

export function getDb() {
  const file = dbPath();
  if (db?.open && openPath === file) return db;
  if (db?.open) db.close();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  openPath = file;
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 3000');
  return db;
}

/** An in-memory database for tests. */
export function memoryDb() {
  const memory = new Database(':memory:');
  memory.pragma('foreign_keys = ON');
  return memory;
}

export const uuid = () => randomUUID();
