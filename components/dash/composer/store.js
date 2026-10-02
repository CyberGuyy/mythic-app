'use client';
// The composer's opener store. Any widget calls
//   openComposer({ kind: 'task', record, prefill: { title, due_day, project_id }, onSaved })
// and the one <ComposerHost /> DashShell mounts draws it. Entries stack, so a
// composer can open another over itself (the task composer's "+ New project");
// only the top one takes keys and focus. Each entry remembers the element that
// had focus when it opened, and focus goes back there when it closes.
import { useSyncExternalStore } from 'react';

let stack = [];
let serial = 0;
const listeners = new Set();
const emit = () => { for (const listener of listeners) listener(); };
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => stack;
const NONE = [];
const empty = () => NONE;

/** Open a composer. kind: task, event, note, project, habit, night, wish,
 *  spend. record: the thing being edited (edit mode), prefill: starting
 *  values for a new one, onSaved(result): after the route said yes. */
export function openComposer({ kind, record = null, prefill = {}, onSaved = null } = {}) {
  const opener = typeof document !== 'undefined' ? document.activeElement : null;
  const key = ++serial;
  stack = [...stack, { key, kind, record, prefill, onSaved, opener }];
  emit();
  return key;
}

/** Close one entry (the top one when no key is given). */
export function closeComposer(key) {
  const entry = key ? stack.find(item => item.key === key) : stack.at(-1);
  if (!entry) return;
  stack = stack.filter(item => item !== entry);
  emit();
  const back = entry.opener;
  // after the modal has left the page, so the opener can take focus again
  if (back && typeof back.focus === 'function') requestAnimationFrame(() => { if (back.isConnected) back.focus({ preventScroll: true }); });
}

export function useComposers() {
  return useSyncExternalStore(subscribe, snapshot, empty);
}
