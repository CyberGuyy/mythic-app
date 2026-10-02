'use client';
// components/dash/widgets/TaskClock.jsx
// Play and stop on a task row, the size of the row's other controls. Idle it is a play icon. Started it is a stop icon inside a thin
// ring that fills toward the estimate and turns warm once past it. The row
// shows no numbers or words: the time is in the tooltip. The time moves on
// every 30 seconds between loads.
import { useEffect, useState } from 'react';
import { Icon } from '../icons.js';
import { clockView, RING } from './task-clock.js';

const TICK_MS = 30000;

export default function TaskClock({ title, clock, onPress }) {
  const [busy, setBusy] = useState(false);
  const key = clock ? clock.started_at + ':' + clock.minutes : null;
  const [tick, setTick] = useState({ key: null, extra: 0 });
  const extra = tick.key === key ? tick.extra : 0;
  const wall = clock?.by === 'wall';
  useEffect(() => {
    if (!key || !wall) return undefined;
    const from = Date.now();
    const timer = setInterval(() => setTick({ key, extra: (Date.now() - from) / 60000 }), TICK_MS);
    return () => clearInterval(timer);
  }, [key, wall]);

  const view = clockView(clock, { title, extra });
  async function press() {
    if (busy) return;
    setBusy(true);
    try { await onPress(view.running ? 'stop' : 'start'); } finally { setBusy(false); }
  }
  const classes = ['tclock', view.running ? 'on' : 'idle', view.over && 'over', busy && 'busy'].filter(Boolean).join(' ');
  const c = RING.size / 2;
  return <button type="button" className={classes} onClick={press} aria-label={view.label} title={view.tip} aria-busy={busy || undefined}>
    {view.running && <svg className="tclock-ring" viewBox={`0 0 ${RING.size} ${RING.size}`} aria-hidden="true">
      <circle className="tr" cx={c} cy={c} r={RING.radius} />
      {view.ratio > 0 && <circle className="tf" cx={c} cy={c} r={RING.radius} strokeDasharray={RING.length} strokeDashoffset={view.offset} transform={`rotate(-90 ${c} ${c})`} />}
    </svg>}
    <Icon name={view.running ? 'stop' : 'play'} size={view.running ? 14 : 13} stroke={2} />
  </button>;
}
