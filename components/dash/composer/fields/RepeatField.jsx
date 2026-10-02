'use client';
// How often a task comes back: None, Daily, Weekly or Monthly.
import { Segmented } from './Segmented.jsx';

const OPTIONS = [['none', 'None'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([value, label]) => ({ value, label, ...(value === 'none' ? { color: 'var(--soft)' } : {}) }));

export default function RepeatField({ value, onChange, labelledBy }) {
  return <Segmented value={value || 'none'} options={OPTIONS} onChange={onChange} labelledBy={labelledBy} />;
}
