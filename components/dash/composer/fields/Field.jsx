'use client';
// The labelled row every composer field sits in, and the chip: the raised
// tone, a thin line, the dimmed accent only when chosen.
import { Icon } from '../../icons.js';

/** A labelled row: the label (and its line icon) on the left, the field and
 *  its error line on the right. */
export function Field({ label, icon, error, id, children, top = false }) {
  return <div className={'cmp-f' + (top ? ' top' : '')} data-field={id}>
    <span className="cmp-l" id={id ? id + '-label' : undefined}>{icon && <Icon name={icon} size={15} stroke={1.7} />}{label}</span>
    <div className="cmp-v">
      {children}
      {error && <p className="cmp-err" id={id ? id + '-error' : undefined} role="alert">{error}</p>}
    </div>
  </div>;
}


/** A chip: a quiet raised button, lit with --c (the dimmed accent by default)
 *  when pressed. */
export function Chip({ on, onClick, icon, color, children, label, className = '', title, ...rest }) {
  return <button type="button" className={'cmp-chip ' + className} aria-pressed={on} aria-label={label} title={title}
    style={color ? { '--c': color } : undefined} onClick={onClick} {...rest}>
    {icon && <Icon name={icon} size={15} stroke={1.8} />}
    {children}
  </button>;
}

