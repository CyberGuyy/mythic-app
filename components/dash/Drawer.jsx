'use client';
// The customise drawer: every widget not on the page with an "Add to" button
// per zone it may use, and the reset for the active theme. Opening it moves
// focus to its heading; adding a widget keeps focus in the list (the next
// entry, else the heading) so several can be added from the keyboard.
// It lies over the page; Hide tucks it away behind a Widgets tab so the
// handles of the side column underneath can be reached.
import { useEffect, useRef } from 'react';
import { offPage, ZONE_NAMES } from '@/lib/dash/layout.js';
import { IconBadge } from './icons.js';

export default function Drawer({ layout, widgets, onAdd, onReset, onHide, onClose }) {
  const off = offPage(layout, widgets);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  const add = (id, zone, index) => {
    const stay = [off[index + 1], off[index - 1]].filter(Boolean).map(meta => `[data-drawer-item="${meta.id}"] button`);
    onAdd(id, zone, [...stay, '.dash-drawer h2']);
  };

  return <aside className="dash-drawer" aria-label="Customise the dashboard">
    <div className="dash-drawer-head">
      <h2 ref={heading} tabIndex={-1}>Widgets</h2>
      <span className="dash-drawer-acts">
        <button type="button" className="lk" onClick={onHide} title="Uncover the page under the drawer">Hide</button>
        <button type="button" className="lk" onClick={onClose}>Done</button>
      </span>
    </div>
    {off.length
      ? <ul className="dash-drawer-list">{off.map((meta, index) => <li key={meta.id} data-drawer-item={meta.id}>
        <IconBadge name={meta.icon} />
        <b>{meta.name}</b>
        <span className="adds">{meta.zones.map(zone => <button key={zone} type="button" className="lk" onClick={() => add(meta.id, zone, index)}>{'Add to ' + ZONE_NAMES[zone].toLowerCase()}</button>)}</span>
      </li>)}</ul>
      : <p className="empty">Every widget is on the page.</p>}
    <p className="dash-drawer-hint">Drag a widget by its bar or use its arrows. Every change saves at once.</p>
    <button type="button" className="lk dash-reset" onClick={onReset}>Reset the layout</button>
  </aside>;
}
