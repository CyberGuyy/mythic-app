'use client';
// The composer: one modal every "new" and "edit" on Dash opens in. Centred,
// at most 560px wide, drawn in the theme's panel language (Yoru viewfinder
// corners on the dot grid), over a
// blurred backdrop. It opens in 260 ms with the page ease (nothing moves under
// reduced motion), keeps Tab inside itself, saves on Cmd Enter, and closes on
// Escape, the close button or a click on the backdrop. With unsaved changes a
// close asks once more first. Focus goes back to the opener (store.js).
import { useEffect, useId, useRef, useState } from 'react';
import { Icon, IconBadge } from '../icons.js';
import { headingOf } from '@/lib/dash/composer.js';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const DISCARD = 'Unsaved changes. Press Escape or Discard to drop them.';

export default function Composer({ kind, editing, flair, active = true, dirty, busy, error, onSave, onClose, aside, saveLabel = 'Save', wide = false, heading, primary, children }) {
  // heading overrides the kind's title; primary replaces the submit button.
  const { title: kindTitle, icon, jp } = headingOf(kind, editing);
  const title = heading || kindTitle;
  const titleId = useId();
  const box = useRef(null);
  const pressed = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const [asked, setAsked] = useState(false);
  const guard = asked && dirty;

  // First focus: the field marked data-autofocus, else the first control,
  // else the dialog itself, so Escape reaches it even with no field to focus.
  useEffect(() => {
    const node = box.current;
    const target = node?.querySelector('[data-autofocus]') || node?.querySelector('.cmp-body')?.querySelector(FOCUSABLE) || node;
    target?.focus({ preventScroll: true });
  }, []);

  const leave = () => {
    if (leaving) return;
    if (still()) { onClose(); return; }
    setLeaving(true);
    setTimeout(onClose, 150);
  };
  const request = () => {
    if (busy) return;
    if (dirty && !guard) { setAsked(true); return; }
    leave();
  };
  // the form's save, then the close without the guard
  const submit = event => { event?.preventDefault(); if (!busy) onSave(); };

  function trap(event) {
    const items = [...box.current.querySelectorAll(FOCUSABLE)].filter(node => node.offsetParent !== null || node === document.activeElement);
    if (!items.length) return;
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  const onKeyDown = event => {
    if (!active) return;
    if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); request(); }
    else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(); }
    else if (event.key === 'Tab') trap(event);
  };

  return <div className={'cmp-layer' + (leaving ? ' out' : '')} inert={!active || undefined}
    onMouseDown={event => { pressed.current = event.target === event.currentTarget; }}
    onClick={event => { if (pressed.current && event.target === event.currentTarget) request(); pressed.current = false; }}
    onKeyDown={onKeyDown}>
    <form ref={box} className={'cmp' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} noValidate data-kind={kind} tabIndex={-1}>
      <header className="cmp-head">
        <IconBadge name={icon} />
        <h2 id={titleId}>{title}</h2>
        {flair?.jp && jp && <em className="jp" lang="ja">{jp}</em>}
        <button type="button" className="edit cmp-x" aria-label="Close" title="Close (Esc)" onClick={request}><Icon name="x" size={14} stroke={2} /></button>
      </header>
      <div className="cmp-body">{children}</div>
      {error && <p className="cmp-err cmp-form-err" role="alert">{error}</p>}
      <footer className="cmp-foot">
        {guard ? <p className="cmp-guard" role="alert">{DISCARD}</p> : aside}
        <span className="cmp-acts">
          <button type="button" className="lk" onClick={guard ? leave : request}>{guard ? 'Discard' : 'Cancel'}</button>
          {primary || <button type="submit" className="btn sm cmp-save" disabled={busy}>{busy ? 'Saving' : saveLabel}<kbd aria-hidden="true">⌘↵</kbd></button>}
        </span>
      </footer>
    </form>
  </div>;
}
