'use client';
// The capture bar in the Dash nav, the most used action on the page
//. Cmd K focuses it, Escape
// leaves it, and Enter opens the composer for the chosen kind with the typed
// line already in it: a task (a work:/life:/home: prefix picks the area), a
// note or a habit. Nothing is filed blind; the line clears once the composer
// saves, and stays if it is cancelled.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.js';
import { openComposer } from './composer/store.js';

const KINDS = [['task', 'Task'], ['note', 'Note'], ['habit', 'Habit']];
const PLACEHOLDER = 'Capture a task, note or habit';
const PREFIX = /^(work|life|home)\s*:\s*(.*)$/i;

/** The composer prefill for a captured line. */
function prefillOf(kind, text) {
  if (kind === 'task') {
    const prefix = text.match(PREFIX);
    return prefix ? { title: prefix[2].trim(), section: prefix[1].toLowerCase() } : { title: text };
  }
  if (kind === 'habit') return { name: text };
  return { title: text };
}

export default function Capture() {
  const input = useRef(null);
  const [kind, setKind] = useState('task');
  const [line, setLine] = useState('');

  useEffect(() => {
    const onKey = event => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
        // not while a composer, a note, a drawing or the Notes picker is open over the page
        if (document.querySelector('.cmp-layer, .nt-layer, .cv-layer')) return;
        event.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function submit() {
    const text = line.trim();
    openComposer({ kind, prefill: prefillOf(kind, text), onSaved: () => setLine('') });
  }

  return <label className="dash-capture-slot capt">
    <Icon name="plus" size={16} stroke={2.2} />
    <input ref={input} value={line} placeholder={PLACEHOLDER} autoComplete="off" aria-label={PLACEHOLDER}
      onChange={event => setLine(event.target.value)}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
        if (event.key === 'Escape') event.currentTarget.blur();
      }} />
    <span className="seg" role="group" aria-label="Capture as">
      {KINDS.map(([id, name]) => <button key={id} type="button" aria-pressed={kind === id}
        onMouseDown={event => { event.preventDefault(); setKind(id); }}
        onClick={() => setKind(id)}>{name}</button>)}
    </span>
    <kbd aria-hidden="true">⌘K</kbd>
  </label>;
}
