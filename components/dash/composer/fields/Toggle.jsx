'use client';
// A quiet switch with its label (Remind me, Priority).
import { Icon } from '../../icons.js';

/** A quiet switch with its label. */
export function Toggle({ checked, onChange, label, icon }) {
  return <button type="button" role="switch" aria-checked={checked} className="cmp-sw" onClick={() => onChange(!checked)}>
    <span className="cmp-sw-t" aria-hidden="true"><i /></span>
    {icon && <Icon name={icon} size={15} stroke={1.7} />}
    <span>{label}</span>
  </button>;
}

