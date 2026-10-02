// One wall time on one day in one timezone as a single instant, refusing the
// times a clock change skips or repeats.
export function zonedMeetingInstant(date, time, timezone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time || '')) throw new Error('Set a complete meeting date and time.');
  const nominal = Date.parse(date + 'T' + time + ':00.000Z');
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 10) !== date) throw new Error('Use a valid meeting date.');
  let format;
  try { format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); }
  catch { throw new Error('Choose a valid meeting timezone.'); }
  const parts = value => Object.fromEntries(format.formatToParts(new Date(value)).map(item => [item.type, item.value]));
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 3) {
    const candidate = nominal + hours * 3600000, p = parts(candidate);
    offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`) - candidate);
  }
  const candidates = [...offsets].map(offset => nominal - offset).filter(value => {
    const p = parts(value); return `${p.year}-${p.month}-${p.day}` === date && `${p.hour}:${p.minute}` === time && p.second === '00';
  });
  if (!candidates.length) throw new Error('That local time does not exist because the clocks change. Correct the meeting time.');
  if (candidates.length !== 1) throw new Error('That local time occurs twice because the clocks change. Enter the intended start and end in UTC.');
  return new Date(candidates[0]).toISOString();
}
