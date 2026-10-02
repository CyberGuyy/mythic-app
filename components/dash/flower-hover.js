'use client';
// The link between the Flower and Habits widgets, which stay separate
// components: which habit is hovered (a petal or a row lights its partner),
// ticks waiting for the server (both show the new state at once), and the
// tick pulse the flower plays when a habit is ticked from either side.
import { useSyncExternalStore } from 'react';
import post from './post.js';

let snapshot = { hover: null, pending: {} };
const listeners = new Set();
const pulseListeners = new Set();
const emit = next => { snapshot = next; for (const listener of listeners) listener(); };
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const read = () => snapshot;
// The server (and hydration) snapshot is one frozen constant, so React never
// sees a new reference from getServerSnapshot and the markup matches the
// server's: nothing hovered, nothing pending.
const SERVER = Object.freeze({ hover: null, pending: Object.freeze({}) });
const readServer = () => SERVER;

export function setFlowerHover(id) {
  if (snapshot.hover === (id ?? null)) return;
  emit({ ...snapshot, hover: id ?? null });
}

/** { hover, pending } shared by both widgets. */
export const useFlowerLink = () => useSyncExternalStore(subscribe, read, readServer);

/** The flower listens here for a tick to pulse. Returns the unsubscribe. */
export function onFlowerPulse(listener) { pulseListeners.add(listener); return () => pulseListeners.delete(listener); }

/** Whether a habit reads as ticked, counting a tick still on its way. */
export const tickedNow = (habit, pending) => Object.hasOwn(pending, habit.id) ? pending[habit.id] : !!habit.checked_today;

/** Drop pending ticks the server data has caught up with. */
export function settlePending(habits) {
  const pending = { ...snapshot.pending };
  let changed = false;
  for (const habit of habits) {
    if (Object.hasOwn(pending, habit.id) && pending[habit.id] === !!habit.checked_today) { delete pending[habit.id]; changed = true; }
  }
  if (changed) emit({ ...snapshot, pending });
}

/** Tick or untick a habit for today from either widget: show it now, pulse the
 *  petal when it turns on, then post. The caller refreshes the page. Throws
 *  the route's line and rolls back if the post fails. */
export async function tickHabit(habit) {
  const next = !tickedNow(habit, snapshot.pending);
  emit({ ...snapshot, pending: { ...snapshot.pending, [habit.id]: next } });
  if (next) for (const listener of pulseListeners) listener(habit.id);
  try {
    await post('/api/flower', { action: 'tick', habit_id: habit.id });
  } catch (error) {
    const pending = { ...snapshot.pending };
    delete pending[habit.id];
    emit({ ...snapshot, pending });
    throw error;
  }
}
