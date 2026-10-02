'use client';
// Sleep: last night in big figures, the average and how many mornings met the
// wake target, then twelve nights as bars on a 22:00 to 10:00 axis (the narrow
// variant sleepBars). A missing night is an
// empty track, not a guess. The pencil opens the edit row: "Log a night"
// opens the night composer (components/dash/composer), and the wake target is
// a time field that saves when a time is picked. Both post to /api/sleep.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PanelTitle from '../PanelTitle.jsx';
import { Icon } from '../icons.js';
import post from '../post.js';
import { openComposer } from '../composer/store.js';
import TimePicker from '../composer/fields/TimePicker.jsx';
import { Field } from '../composer/fields/Field.jsx';
import { WAKE_QUICK } from '@/lib/dash/composer.js';

// The axis, in minutes from midnight of the waking day: 22:00 the evening
// before to 10:00.
const AXIS_START = -120;
const AXIS_SPAN = 720;
const HOURS = [-120, 0, 120, 240, 360, 480, 600];
const NARROW = new Set([-120, 120]);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = value => String(value).padStart(2, '0');
const toMinutes = time => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const bedOf = time => { const m = toMinutes(time); return m >= 720 ? m - 1440 : m; };
const clock = minutes => { const m = ((minutes % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
const hm = minutes => Math.floor(minutes / 60) + 'h\u00a0' + pad(minutes % 60) + 'm';
const short = time => time.replace(/^0(\d)/, '$1');
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const onAxis = minutes => minutes >= AXIS_START && minutes <= AXIS_START + AXIS_SPAN;
const at = minutes => (clamp((minutes - AXIS_START) / AXIS_SPAN, 0, 1) * 100).toFixed(2) + '%';
const dayLabel = day => { const date = new Date(day + 'T12:00:00Z'); return WEEKDAYS[date.getUTCDay()] + ' ' + date.getUTCDate() + ' ' + MONTHS[date.getUTCMonth()]; };

/** Where the nights come from: a link to set up Apple Health until its file
 *  arrives, then a quiet line, or the problem with the file. */
function HealthLine({ health }) {
  if (!health) return null;
  if (!health.found) return <p className="sl-s sl-src"><a className="lk" href="/settings#health">Connect Apple Health</a></p>;
  if (health.error) return <p className="sl-s sl-src"><span>Apple Health: {health.error}</span> <a className="lk" href="/settings#health">Fix</a></p>;
  return <p className="sl-s sl-src"><a className="lk" href="/settings#health">Apple Health</a>{health.last_night ? <span> · up to {dayLabel(health.last_night)}</span> : null}</p>;
}

export default function Sleep({ data, flair, meta }) {
  const router = useRouter();
  const today = data?.today;
  const nights = data?.nights || [];
  const byDay = Object.fromEntries(nights.map(night => [night.day, night]));
  const last = data?.last || null;
  const target = data?.target || '08:00';

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pencil = useRef(null);

  function close() {
    setEditing(false);
    setError('');
    pencil.current?.focus();
  }

  // before 04:00 local time the loader starts the night on yesterday (log_day)
  const logNight = () => openComposer({ kind: 'night', prefill: { day: data?.log_day || today, nights: byDay } });
  async function saveTarget(value) {
    if (!value || value === target || busy) return;
    setBusy(true);
    setError('');
    try {
      await post('/api/sleep', { action: 'target', wake_target: value });
      router.refresh();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  // The target reads as a morning time on the axis. One outside 22:00 to
  // 10:00 has no place on it, so the line and its label are left off rather
  // than pinned to an edge they do not belong to.
  const targetAt = toMinutes(target);
  const targetShown = onAxis(targetAt);
  const labels = HOURS.filter(minutes => !targetShown || Math.abs(minutes - targetAt) >= 90 || minutes === targetAt);
  if (targetShown && !labels.includes(targetAt)) labels.push(targetAt);
  labels.sort((a, b) => a - b);
  const days = data?.days || [];

  return <section className="panel sl">
    <PanelTitle icon={meta.icon} title="Sleep" jp={meta.jp} flair={flair}>
      <button type="button" ref={pencil} className="edit" aria-label="Edit sleep" title="Edit sleep" aria-expanded={editing} onClick={() => { setEditing(open => !open); setError(''); }}>
        <Icon name="pen" />
      </button>
    </PanelTitle>

    {editing && <div className="cmp-inline sl-edit" onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); close(); } }}>
      <Field label="Wake target" id="sleep-target" error={error}>
        <TimePicker value={target} onChange={saveTarget} label="Wake target" quick={WAKE_QUICK} clear={false} />
      </Field>
      <span className="cmp-acts"><button type="button" className="btn sm" onClick={logNight}>Log a night</button></span>
    </div>}

    {last ? <>
      <div className="sl-head">
        <div className="sl-n" role="img" aria-label={hm(last.minutes)}>{Math.floor(last.minutes / 60)}<small>h</small>{pad(last.minutes % 60)}<small>m</small></div>
        <p className="sl-s">
          {last.source === 'apple_health' && <span>Asleep · </span>}{last.bed_at} to {last.woke_at}
          {last.day !== today && <span> on {dayLabel(last.day)}</span>}
          {data.average_minutes != null && <span> · average{'\u00a0'}{hm(data.average_minutes)}</span>}
        </p>
        {nights.length > 0 && <p className="sl-s"><span>Up by {short(target)} on {data.on_time_count} of {nights.length} {nights.length === 1 ? 'night' : 'nights'}</span></p>}
      </div>
      <div className="slb" role="img" aria-label={`Bed and wake times for the last ${days.length} nights`}>
        {days.map((dayKey, index) => {
          const night = byDay[dayKey];
          const row = index === days.length - 1 ? 'n last' : 'n';
          if (!night) return <div key={dayKey} className={row} title={dayLabel(dayKey) + ': not logged'} />;
          // The bar runs bed to wake; minutes may be time asleep (Apple Health).
          const start = bedOf(night.bed_at), end = start + (night.in_bed_minutes ?? night.minutes);
          const x0 = at(start), width = (parseFloat(at(end)) - parseFloat(x0)).toFixed(2) + '%';
          const warmth = clamp((night.minutes / 60 - 7) / 1.2, 0, 1).toFixed(2);
          return <div key={dayKey} className={row}>
            <i className={night.on_time ? 'ok' : ''} style={{ '--x0': x0, '--w': width, '--v': warmth, '--o': (index / Math.max(1, days.length - 1)).toFixed(2), '--k': index }}
              title={`${dayLabel(dayKey)}: ${night.bed_at} to ${night.woke_at}, ${hm(night.minutes)}${night.source === 'apple_health' ? ' asleep' : ''}`} />
          </div>;
        })}
        {targetShown && <div className="tg" style={{ '--x': at(targetAt) }} />}
        <div className="ax" aria-hidden="true">
          {labels.map(minutes => <span key={minutes} className={(minutes === targetAt ? 'on n' : NARROW.has(minutes) ? 'n' : '')} style={{ left: at(minutes) }}>{clock(minutes)}</span>)}
        </div>
      </div>
    </> : <p className="empty">No nights logged. <button type="button" className="lk" onClick={logNight}>Log last night</button></p>}
    <HealthLine health={data?.health} />
  </section>;
}
