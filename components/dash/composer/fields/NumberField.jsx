'use client';
// A whole number with its unit.


/** A whole number with its unit after it. */
export function NumberField({ value, onChange, unit, label, placeholder = '', min = 1, max = 999, invalid }) {
  return <label className="cmp-num">
    <input value={value} inputMode="numeric" placeholder={placeholder} aria-label={label} aria-invalid={invalid || undefined}
      onChange={event => onChange(event.target.value.replace(/[^\d]/g, '').slice(0, String(max).length))} data-min={min} />
    {unit && <span>{unit}</span>}
  </label>;
}

