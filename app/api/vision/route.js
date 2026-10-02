import fs from 'node:fs';
import { Readable } from 'node:stream';
import { getDb } from '@/lib/db.js';
import { localToday } from '@/lib/day.js';
import { ensureVision, addVision, reorderVision, layoutVision, frameVision, removeVision, visionFile, MAX_VISION_BYTES } from '@/lib/dash/vision.js';

import { RouteError, jsonRoute, sameOrigin } from '@/lib/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Room for the multipart boundaries and part headers around one 8 MB photo.
const MAX_UPLOAD_BYTES = MAX_VISION_BYTES + 64 * 1024;
const noStore = { 'Cache-Control': 'no-store' };
const visionDb = () => { const db = getDb(); ensureVision(db); return db; };
const wrap = call => { try { return call(); } catch (error) { throw new RouteError(error.message); } };
const failure = (error, fallback) => Response.json({ error: error?.message || fallback },
  { status: Number.isInteger(error?.status) ? error.status : 400, headers: noStore });

/** GET ?file=<id>: one photo's bytes. The id must be a row of vision_items;
 *  the path comes from that row, never from the request. */
export async function GET(request) {
  try {
    const found = visionFile(visionDb(), new URL(request.url).searchParams.get('file'));
    if (!found) return failure(new RouteError('That photo is not on the board.', 404));
    let stat;
    try { stat = fs.statSync(found.path); } catch { return failure(new RouteError('That photo file is missing.', 404)); }
    if (!stat.isFile()) return failure(new RouteError('That photo file is missing.', 404));
    return new Response(Readable.toWeb(fs.createReadStream(found.path)), { headers: {
      'Content-Type': found.mime, 'Content-Length': String(stat.size),
      // The id names one file for ever: a replaced photo gets a new id.
      'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    return failure(error, 'The vision board is unavailable');
  }
}

/** Read the request body with a hard byte cap, whatever Content-Length says. */
async function readCapped(request, limit) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new RouteError('That photo is over 8 MB.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RouteError('Choose a photo to add.');
  const chunks = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) { await reader.cancel(); throw new RouteError('That photo is over 8 MB.', 413); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** POST multipart/form-data with a `file` field: add one photo. */
async function upload(request) {
  try {
    sameOrigin(request);
    
    const type = request.headers.get('content-type') || '';
    const body = await readCapped(request, MAX_UPLOAD_BYTES);
    let form;
    try { form = await new Response(body, { headers: { 'Content-Type': type } }).formData(); }
    catch { throw new RouteError('Send the photo as a form upload.'); }
    const file = form.get('file');
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') throw new RouteError('Choose a photo to add.');
    if (file.size > MAX_VISION_BYTES) throw new RouteError('That photo is over 8 MB.', 413);
    const bytes = Buffer.from(await file.arrayBuffer());
    const item = wrap(() => addVision(visionDb(), { bytes, today: localToday(new Date()), now: new Date() }));
    return Response.json({ ok: true, item: { id: item.id, src: `/api/vision?file=${item.id}`, stamp: item.stamp } }, { headers: noStore });
  } catch (error) {
    return failure(error, 'That photo could not be added');
  }
}

/** POST JSON: { action: 'layout', items: [{ id, w, h }] } (order and sizes),
 *  { action: 'frame', id, x, y, zoom, w?, h? } (one photo's crop),
 *  { action: 'reorder', ids } or { action: 'remove', id }. */
const change = jsonRoute(async body => {
  const db = visionDb();
  if (body.action === 'frame') return { ok: true, item: wrap(() => frameVision(db, body.id, body)) };
  if (body.action === 'layout') return { ok: true, items: wrap(() => layoutVision(db, body.items)) };
  if (body.action === 'reorder') { wrap(() => reorderVision(db, body.ids)); return { ok: true }; }
  if (body.action === 'remove') { wrap(() => removeVision(db, body.id)); return { ok: true }; }
  throw new RouteError('Unknown action.');
});

export async function POST(request) {
  const type = request.headers.get('content-type')?.toLowerCase() || '';
  return type.startsWith('multipart/form-data') ? upload(request) : change(request);
}
