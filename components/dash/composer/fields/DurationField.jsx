'use client';
// How long: chips for 15m to 3h and a small custom minutes box. This is the
// task's estimate_minutes (5 to 1440 whole minutes). Pressing the chosen chip
// again clears it. A custom number that is not whole minutes in range is sent
// up as NaN, so the form shows the route's own line under the field.
import { useState } from 'react';
import { Chip } from './Field.jsx';
import { DURATION_CHIPS, durationChipLabel, readMinutes } from '@/lib/dash/composer.js';

export default function DurationField({ value, onChange, labelledBy, invalid }) {
  const custom = Number.isInteger(value) && !DURATION_CHIPS.includes(value);
  const [draft, setDraft] = useState(custom ? String(value) : '');
  const shown = DURATION_CHIPS.includes(value) ? '' : draft;
  return <div className="cmp-row cmp-dur" role="group" aria-labelledby={labelledBy}>
    <span className="cmp-track">
      {DURATION_CHIPS.map(minutes => <Chip key={minutes} on={value === minutes} className="mono" onClick={() => { setDraft(''); onChange(value === minutes ? null : minutes); }}>
        {durationChipLabel(minutes)}
      </Chip>)}
    </span>
    <label className={'cmp-num cmp-min' + (custom ? ' on' : '')}>
      <input value={shown} inputMode="numeric" placeholder="-" aria-label="Other length in minutes" title="Other length in minutes" aria-invalid={invalid || undefined}
        onChange={event => { const text = event.target.value.replace(/[^\d]/g, '').slice(0, 4); setDraft(text); onChange(readMinutes(text)); }} />
      <span>min</span>
    </label>
  </div>;
}
