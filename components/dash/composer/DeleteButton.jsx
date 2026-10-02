'use client';
// Delete in two steps: the first press asks, the second deletes.
import { useState } from 'react';

export default function DeleteButton({ onDelete, busy, label = 'Delete', title }) {
  const [asking, setAsking] = useState(false);
  const named = title ? { title: asking ? title + ' for good' : title, 'aria-label': asking ? title + ' for good' : title } : {};
  return <button type="button" className={'lk cmp-del' + (asking ? ' on' : '')} disabled={busy} {...named}
    onClick={() => (asking ? onDelete() : setAsking(true))} onBlur={() => setAsking(false)}>
    {asking ? label + ' for good' : label}
  </button>;
}
