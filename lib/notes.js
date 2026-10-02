// Notes: a title, a body and maybe a project, kept in SQLite. Listed newest
// first for the Notes widget; saved through /api/notes, which refuses to
// write over a note that changed after the editor opened it.
import { randomUUID } from 'node:crypto';
import { SECTIONS } from './task-list.js';
import { localToday, zoned } from './day.js';
import { ensureProjects, listProjects } from './simple/projects.js';

export const EXCERPT = 80;
export const MAX_BODY = 20000;
/** The line a stale save gets. components/dash/composer/forms/NoteForm.jsx matches on it. */
export const STALE_NOTE = 'This note changed somewhere else after you opened it. Save again to keep your version.';
const DAY_MS = 86400000;
const oneLine = text => String(text ?? '').replace(/\s+/g, ' ').trim();

export function ensureNotes(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', project_id TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)`);
}

/** When a note was last saved, on the local calendar: Today, Yesterday, a
 *  weekday inside the week, else the date (with the year once it is not this one). */
export function whenOf(iso, now = new Date()) {
  if (!Number.isFinite(Date.parse(iso))) return '';
  const day = localToday(new Date(iso)), today = localToday(now);
  const away = Math.round((Date.parse(today) - Date.parse(day)) / DAY_MS);
  if (away <= 0) return 'Today';
  if (away === 1) return 'Yesterday';
  const date = new Date(day + 'T12:00:00Z');
  if (away < 7) return zoned('en-GB', { weekday: 'short' }).format(date);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).format(date);
}

export function excerptOf(body) {
  const text = oneLine(body);
  return text.length > EXCERPT ? text.slice(0, EXCERPT).trimEnd() + '…' : text;
}

/** Every note newest first, shaped for the widget. */
export function listNotes(db, { now = new Date() } = {}) {
  ensureNotes(db);
  ensureProjects(db);
  const projects = new Map(listProjects(db).map(project => [project.id, project]));
  const notes = db.prepare('SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC, rowid DESC').all().map(note => {
    const project = note.project_id ? projects.get(note.project_id) : null;
    return {
      id: note.id, title: oneLine(note.title) || 'Untitled', body: note.body, excerpt: excerptOf(note.body),
      project_id: note.project_id || null, project_name: project?.name || null,
      domain: SECTIONS.includes(project?.domain) ? project.domain : 'work',
      when: whenOf(note.updated_at, now), stamp: note.updated_at,
    };
  });
  return { notes, count: notes.length };
}

/** Save a note: a new one without an id, else that note. updated_at is the
 *  stamp the editor opened; a newer stored note refuses with STALE_NOTE.
 *  project_id left out keeps the note's project. Returns the id. */
export function saveNote(db, { id, title, body = '', project_id: projectId, updated_at: seen } = {}, now = new Date()) {
  ensureNotes(db);
  if (typeof title !== 'string' || !title.trim()) throw new Error('Give the note a title.');
  if (typeof body !== 'string') throw new Error('Write the note as text.');
  if (body.length > MAX_BODY) throw new Error('Keep a note under 20,000 characters.');
  const existing = id ? db.prepare('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL').get(id) : null;
  if (id && !existing) throw new Error('Note not found.');
  if (existing && seen && seen !== existing.updated_at) throw Object.assign(new Error(STALE_NOTE), { status: 409 });
  const project = projectId === undefined ? existing?.project_id ?? null : projectId || null;
  if (project && project !== existing?.project_id) {
    ensureProjects(db);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ? AND archived_at IS NULL').get(project)) throw new Error('Choose an existing project or none.');
  }
  const at = now.toISOString();
  if (existing) {
    db.prepare('UPDATE notes SET title = ?, body = ?, project_id = ?, updated_at = ? WHERE id = ?').run(title.trim().slice(0, 200), body, project, at, id);
    return id;
  }
  const fresh = randomUUID();
  db.prepare('INSERT INTO notes (id, title, body, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(fresh, title.trim().slice(0, 200), body, project, at, at);
  return fresh;
}

/** Delete keeps the row, marked, so nothing is lost. */
export function deleteNote(db, id, now = new Date()) {
  ensureNotes(db);
  const done = db.prepare('UPDATE notes SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(now.toISOString(), id);
  if (!done.changes) throw new Error('Note not found.');
}

export const loadNotes = async ({ db, now }) => listNotes(db, { now });
