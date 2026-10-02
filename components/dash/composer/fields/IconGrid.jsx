'use client';
// The habit icons as a grid of line icons, in labelled groups when given
// groups ([label, icons] pairs, lib/dash/flower-icons.js HABIT_ICON_GROUPS),
// scrolling inside the composer once there are many. The chosen icon shows
// beside the label as it will look on the flower, as a dot-matrix glyph.
import { Icon } from '../../icons.js';
import { PixelIcon } from '../../pixel-icon.js';

/** The habit icons, one line icon a button. */
export function IconGrid({ value, onChange, icons = [], groups = null, labelledBy }) {
  const button = icon => <button key={icon} type="button" aria-pressed={value === icon} aria-label={'The ' + icon + ' icon'} title={icon}
    onClick={() => onChange(value === icon ? null : icon)}><Icon name={icon} size={19} stroke={1.7} /></button>;
  if (!groups) return <div className="cmp-icons" role="group" aria-labelledby={labelledBy}>{icons.map(button)}</div>;
  return <div className="cmp-icon-groups" role="group" aria-labelledby={labelledBy}>
    {value && <p className="cmp-icon-on"><PixelIcon name={value} pitch={2} /><span>On the flower</span></p>}
    {groups.map(([label, list]) => <div key={label} className="cmp-icon-group">
      <span className="cmp-icon-label">{label}</span>
      <div className="cmp-icons">{list.map(button)}</div>
    </div>)}
  </div>;
}
