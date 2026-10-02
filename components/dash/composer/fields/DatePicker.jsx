'use client';
// The date field: a chip that says "Today", "Tomorrow", "Fri 26 Sep" or
// "No date", and under it a mini calendar in the Calendar widget's style
// (Monday first, month arrows, today ringed, the chosen day in the dimmed
// accent) with quick chips for Today, Tomorrow, Next Mon and Clear. Arrow keys
// walk the days; Enter or a click picks one. inline draws the calendar in the
// form itself, without the chip (the event composer).
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../icons.js';
import { usePopover } from './usePopover.js';
import { addDays, dateChipLabel, monthCells, monthTitle, addMonths, quickDays, isDay } from '@/lib/dash/composer.js';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const LONG = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const longDay = day => LONG.format(new Date(day + 'T12:00:00Z'));

export function MiniCalendar({ value, today, min, max, onPick, clear = true, autoFocus = true }) {
  const start = isDay(value) ? value : today;
  const [month, setMonth] = useState(start.slice(0, 7));
  const [cursor, setCursor] = useState(start);
  const moved = useRef(autoFocus);
  const grid = useRef(null);
  const allowed = day => (!min || day >= min) && (!max || day <= max);

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector(`[data-day="${cursor}"]`)?.focus({ preventScroll: true });
  }, [cursor, month]);

  const walk = event => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      const next = addMonths(month, event.key === 'PageUp' ? -1 : 1);
      moved.current = true;
      setMonth(next);
      // the same date in the next month, kept inside short months
      setCursor(next + '-' + String(Math.min(Number(cursor.slice(8)), 28)).padStart(2, '0'));
      return;
    }
    if (!step) return;
    event.preventDefault();
    const next = addDays(cursor, step);
    moved.current = true;
    setCursor(next);
    if (next.slice(0, 7) !== month) setMonth(next.slice(0, 7));
  };

  const cells = monthCells(month);
  // the one day Tab lands on: the cursor, or the 1st once the arrows paged away
  const stop = cells.some(cell => cell.day === cursor) ? cursor : month + '-01';
  return <div className="cmp-cal">
    <div className="cmp-quick">
      {quickDays(today).map(([label, day]) => <button key={label} type="button" className="cmp-q" aria-pressed={value === day} disabled={!allowed(day)} onClick={() => onPick(day)}>{label}</button>)}
      {clear && <button type="button" className="cmp-q clear" disabled={!value} onClick={() => onPick(null)}>Clear</button>}
    </div>
    <div className="cmp-cal-h">
      <b>{monthTitle(month, today)}</b>
      <button type="button" className="cmp-nav" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><Icon name="left" size={15} stroke={2} /></button>
      <button type="button" className="cmp-nav" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><Icon name="right" size={15} stroke={2} /></button>
    </div>
    <div className="cmp-cal-g" ref={grid} role="grid" aria-label={monthTitle(month, today)} onKeyDown={walk}>
      {LETTERS.map((letter, index) => <em key={index} aria-hidden="true">{letter}</em>)}
      {cells.map(cell => {
        const cls = [!cell.in_month && 'out', cell.day === today && 'today', cell.day === value && 'on', cell.day < today && 'past'].filter(Boolean).join(' ');
        return <button key={cell.day} type="button" data-day={cell.day} className={cls || undefined} tabIndex={cell.day === stop ? 0 : -1}
          aria-pressed={cell.day === value} aria-label={longDay(cell.day) + (cell.day === today ? ', today' : '')} disabled={!allowed(cell.day)}
          onFocus={() => setCursor(cell.day)} onClick={() => onPick(cell.day)}>{cell.date}</button>;
      })}
    </div>
  </div>;
}

export default function DatePicker({ value, onChange, today, min, max, label = 'Date', invalid, clear = true, inline = false, placeholder = 'No date' }) {
  const { open, toggle, close, up, wrapRef, chipRef, popRef, onKeyDown } = usePopover();
  if (inline) return <div className="cmp-pop is-open"><MiniCalendar value={value} today={today} min={min} max={max} clear={clear} autoFocus={false} onPick={onChange} /></div>;
  const text = isDay(value) ? dateChipLabel(value, today) : placeholder;
  return <div className="cmp-pick" ref={wrapRef} onKeyDown={onKeyDown}>
    <button ref={chipRef} type="button" className={'cmp-chip cmp-when' + (isDay(value) ? ' set' : '')} aria-haspopup="dialog" aria-expanded={open}
      aria-label={label + ': ' + text} data-invalid={invalid || undefined} onClick={toggle}>
      <Icon name="cal" size={15} stroke={1.7} />{text}<Icon name="down" size={13} stroke={2} className="cmp-caret" />
    </button>
    {open && <div ref={popRef} className={'cmp-pop' + (up ? ' up' : '')} role="dialog" aria-label={'Choose ' + label.toLowerCase()}>
      <MiniCalendar value={value} today={today} min={min} max={max} clear={clear} onPick={day => { onChange(day); close(); }} />
    </div>}
  </div>;
}
