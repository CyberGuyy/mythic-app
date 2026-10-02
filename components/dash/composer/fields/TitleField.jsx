'use client';
// The composer's first line.


/** The large first line: 18px, medium weight, focused on open. */
export function TitleField({ value, onChange, placeholder, error, label = 'Title', maxLength = 500, autoFocus = true }) {
  return <div className="cmp-t" data-field="title">
    <input className="cmp-title" value={value} placeholder={placeholder} aria-label={label} maxLength={maxLength} autoComplete="off"
      data-autofocus={autoFocus || undefined} aria-invalid={!!error || undefined} aria-describedby={error ? 'cmp-title-error' : undefined}
      onChange={event => onChange(event.target.value)} />
    {error && <p className="cmp-err" id="cmp-title-error" role="alert">{error}</p>}
  </div>;
}

