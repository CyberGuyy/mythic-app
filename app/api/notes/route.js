// Notes: save (new or edit) and delete.
import { getDb } from '@/lib/db.js';
import { saveNote, deleteNote } from '@/lib/notes.js';
import { jsonRoute, need, RouteError } from '@/lib/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const run = call => { try { return call(); } catch (error) { throw new RouteError(error.message, error.status || 400); } };

export const POST = jsonRoute(async body => {
  const db = getDb();
  if (body.action === 'save') return { ok: true, id: run(() => saveNote(db, body)) };
  if (body.action === 'delete') {
    need(typeof body.id === 'string' && body.id, 'Name the note to delete.');
    run(() => deleteNote(db, body.id));
    return { ok: true };
  }
  throw new RouteError('Unknown action.');
});
