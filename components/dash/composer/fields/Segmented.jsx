'use client';
// One of a few, as chips (Work / Life / Home, morning / afternoon / evening,
// tasks / hours).
import { Chip } from './Field.jsx';

/** One of a few: [{ value, label, icon, color }], as one joined track with
 *  the chosen segment lit in its colour (the dimmed accent by default). */
export function Segmented({ value, options, onChange, labelledBy, className = '' }) {
  return <div className={'cmp-track ' + className} role="group" aria-labelledby={labelledBy}>
    {options.map(option => <Chip key={option.value} on={value === option.value} icon={option.icon} color={option.color}
      onClick={() => onChange(option.value)}>{option.label}</Chip>)}
  </div>;
}

