// The token API for sleep: an iPhone Shortcut (or anything else) sends Apple
// Health's Sleep Analysis samples, and they become nights on the Sleep widget.
//   POST /api/v1/sleep   { samples: "start | end | value | source\n..." } or { samples: [{ start, end, value }] }
// A night you typed by hand is never overwritten.
import { parseSamples, samplesToNights, writeHealthNights } from '@/lib/dash/health-sleep.js';
import { tokenRoute, need } from '@/lib/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = tokenRoute(async (body, request, db) => {
  const text = typeof body.samples === 'string' ? body.samples : JSON.stringify(body.samples ?? []);
  need(text.length <= 2_000_000, 'Send at most 2 MB of samples.');
  const samples = parseSamples(text);
  need(samples.length, 'No sleep samples found. Send lines of "start | end | value".');
  const nights = samplesToNights(samples);
  const written = writeHealthNights(db, nights);
  return { ok: true, samples: samples.length, nights: nights.length, written };
});
