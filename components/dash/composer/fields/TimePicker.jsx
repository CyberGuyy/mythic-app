'use client';
// The time field: a chip that says "15:00" or "No time", and under it a
// typed line ("930", "9:30" and "9.30" all work), an hour column beside a
// five-minute column, and the quick chips down the side (Morning 09:00, Noon,
// Afternoon 14:00, Evening 18:00, Clear). A minute or a quick chip picks and
// closes; an hour keeps it open for the minute. inline draws the panel in the
// form, without the chip.
import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../icons.js';
import { usePopover } from './usePopover.js';
import { HOURS, MINUTES, TIME_QUICK, isTime, parseTime, timeChipLabel, withHour, withMinute } from '@/lib/dash/composer.js';

const TYPED = 'Write a time like 9:30 or 1530.';

export function TimePanel({ value, onPick, onDone, clear = true, autoFocus = true, quick = TIME_QUICK }) {
  const [draft, setDraft] = useState(isTime(value) ? value : '');
  const [bad, setBad] = useState(false);
  const hours = useRef(null);
  const minutes = useRef(null);
  const hour = isTime(value) ? value.slice(0, 2) : null;
  const minute = isTime(value) ? value.slice(3) : null;

  // The chosen hour and minute sit in the middle of their columns (09 and 00
  // when there is no time yet): at once on open, then with a short glide.
  const opened = useRef(false);
  useLayoutEffect(() => {
    const smooth = opened.current && !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const centre = (list, key) => {
      const item = list?.querySelector(`[data-v="${key}"]`);
      if (!item) return;
      const top = item.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - (list.clientHeight - item.offsetHeight) / 2;
      list.scrollTo({ top, behavior: smooth ? 'smooth' : 'instant' });
    };
    centre(hours.current, hour || '09');
    centre(minutes.current, minute || '00');
    opened.current = true;
  }, [hour, minute]);

  const typed = () => {
    const time = parseTime(draft);
    if (time === null) { setBad(true); return; }
    setBad(false);
    onPick(time || null);
    onDone?.();
  };
  const set = time => { setDraft(time || ''); setBad(false); onPick(time); };

  return <div className="cmp-time">
    <div className="cmp-time-in">
      <Icon name="clock" size={15} stroke={1.7} />
      <input value={draft} placeholder="Type 930 or 9:30" aria-label="Type a time" inputMode="numeric" autoComplete="off" autoFocus={autoFocus}
        aria-invalid={bad || undefined} onChange={event => { setDraft(event.target.value); setBad(false); }}
        onBlur={() => { if (draft.trim() && parseTime(draft)) set(parseTime(draft)); }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) { event.preventDefault(); typed(); } }} />
    </div>
    {bad && <p className="cmp-err" role="alert">{TYPED}</p>}
    <div className="cmp-time-b">
      <div className="cmp-cols">
        <div className="cmp-col" ref={hours} role="group" aria-label="Hour">
          {HOURS.map(h => <button key={h} type="button" data-v={h} aria-pressed={hour === h} onClick={() => set(withHour(value, h))}>{h}</button>)}
        </div>
        <span className="cmp-colon" aria-hidden="true">:</span>
        <div className="cmp-col" ref={minutes} role="group" aria-label="Minute">
          {MINUTES.map(m => <button key={m} type="button" data-v={m} aria-pressed={minute === m} onClick={() => { set(withMinute(value, m, hour || '09')); onDone?.(); }}>{m}</button>)}
        </div>
      </div>
      <div className="cmp-quick cmp-quick-v">
        {quick.map(([label, time]) => <button key={time} type="button" className="cmp-q" aria-pressed={value === time} onClick={() => { set(time); onDone?.(); }}>
          <span>{label}</span>{label !== time && <small>{time}</small>}
        </button>)}
        {clear && <button type="button" className="cmp-q clear" disabled={!value} onClick={() => { set(null); onDone?.(); }}>Clear</button>}
      </div>
    </div>
  </div>;
}

export default function TimePicker({ value, onChange, label = 'Time', invalid, clear = true, inline = false, placeholder = 'No time', quick = TIME_QUICK }) {
  const { open, toggle, close, up, wrapRef, chipRef, popRef, onKeyDown } = usePopover();
  if (inline) return <div className="cmp-pop is-open"><TimePanel value={value} clear={clear} quick={quick} autoFocus={false} onPick={onChange} /></div>;
  const text = isTime(value) ? timeChipLabel(value) : placeholder;
  return <div className="cmp-pick" ref={wrapRef} onKeyDown={onKeyDown}>
    <button ref={chipRef} type="button" className={'cmp-chip cmp-when' + (isTime(value) ? ' set mono' : '')} aria-haspopup="dialog" aria-expanded={open}
      aria-label={label + ': ' + text} data-invalid={invalid || undefined} onClick={toggle}>
      <Icon name="clock" size={15} stroke={1.7} />{text}<Icon name="down" size={13} stroke={2} className="cmp-caret" />
    </button>
    {open && <div ref={popRef} className={'cmp-pop time' + (up ? ' up' : '')} role="dialog" aria-label={'Choose ' + label.toLowerCase()}>
      <TimePanel value={value} clear={clear} quick={quick} onPick={onChange} onDone={() => close()} />
    </div>}
  </div>;
}
