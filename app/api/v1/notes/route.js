// The token API for notes.
//   GET  /api/v1/notes   every note, newest first
//   POST /api/v1/notes   { title, body? }
import { listNotes, saveNote } from '@/lib/notes.js';
import { tokenRoute, RouteError } from '@/lib/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = tokenRoute(async (body, request, db) => ({
  notes: listNotes(db).notes.map(({ id, title, body: text, project_name: project, stamp: updated_at }) => ({ id, title, body: text, project, updated_at })),
}));

export const POST = tokenRoute(async (body, request, db) => {
  try { return { ok: true, id: saveNote(db, { title: body.title, body: body.body || '' }) }; }
  catch (error) { throw new RouteError(error.message); }
});
