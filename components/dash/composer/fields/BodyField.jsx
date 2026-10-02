'use client';
// Free text: the auto-growing body and a one-line field in the same style.
import { useLayoutEffect, useRef } from 'react';

/** The note body: a textarea that grows with its text, four lines at least. */
export function BodyField({ value, onChange, placeholder, label = 'Note', minRows = 4, maxLength = 16000, invalid }) {
  const area = useRef(null);
  useLayoutEffect(() => {
    const node = area.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = Math.min(node.scrollHeight + 2, 420) + 'px';
  }, [value]);
  return <textarea ref={area} className="cmp-body-in" value={value} rows={minRows} placeholder={placeholder} aria-label={label} maxLength={maxLength}
    aria-invalid={invalid || undefined} onChange={event => onChange(event.target.value)} />;
}


/** One line of text in the field style. */
export function LineField({ value, onChange, placeholder, label, maxLength = 200, invalid, autoFocus }) {
  return <input className="cmp-in" value={value} placeholder={placeholder} aria-label={label} maxLength={maxLength} autoComplete="off"
    data-autofocus={autoFocus || undefined} aria-invalid={invalid || undefined} onChange={event => onChange(event.target.value)} />;
}

