'use client';
// Today: the day as a timetable. The
// planned minutes in Gloock with the share already gone by, then the timed
// tasks, reminders and meetings in order, the now line where the clock is and,
// under it, the free time before the next item with one task that fits.
// The clock moves on the client: the rows, the line and the gap are worked out
// again by lib/dash/today-live.js on each turn of the minute (one timer, set to
// the next minute, and again when the tab comes back into view). "+ Event"
// adds a timed task for today (a reminder is just a task) through
// /api/tasks; Escape or Cancel closes it and focus goes back to the
// button.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PanelTitle from '../PanelTitle.jsx';
import { openComposer } from '../composer/store.js';
import { liveDay, formatMinutes, localMinutes, untilNextMinute } from '@/lib/dash/today-live.js';
import { localToday } from '@/lib/day.js';

const DOMAINS = new Set(['work', 'life', 'home']);
const KIND = { event: 'Event', task: 'Task', reminder: 'Reminder' };

function metaOf(item) {
  const parts = [];
  if (item.project_name) parts.push(item.project_name);
  if (item.kind === 'reminder') parts.push('Reminder');
  else if (item.minutes) parts.push(formatMinutes(item.minutes));
  return parts.length ? parts.join(' · ') : KIND[item.kind] || 'Task';
}

export default function Today({ data, flair, meta }) {
  const router = useRouter();
  const [minute, setMinute] = useState(data.now_minutes);

  // The page was drawn at the server's minute; from here the browser's clock
  // moves the line, once a minute on the turn of the minute. A new local day
  // reloads the widget's data.
  useEffect(() => {
    let timer = null;
    const tick = () => {
      clearTimeout(timer);
      const now = new Date();
      if (localToday(now) !== data.day) router.refresh();
      else setMinute(localMinutes(now));
      timer = setTimeout(tick, untilNextMinute(now.getTime()));
    };
    const onShow = () => { if (document.visibilityState === 'visible') tick(); };
    tick();
    document.addEventListener('visibilitychange', onShow);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onShow); };
  }, [data.day, router]);

  const day = useMemo(() => liveDay(data, minute), [data, minute]);
  const { items, free } = day;
  const nowLine = <div className="tdn" key="now"><span>{day.now} now</span></div>;
  const freeRow = free && <div className="tdf" key="free">
    <time>{formatMinutes(free.minutes)}</time>
    <p><b>free until {free.until}</b>{free.fit && <small title={free.fit.title}>fits: {free.fit.title}{free.fit.minutes ? ' · ' + formatMinutes(free.fit.minutes) : ''}</small>}</p>
  </div>;

  return <section className="panel tdw">
    <PanelTitle icon={meta.icon} title="Today" jp={meta.jp} flair={flair}>
      <button type="button" className="lk" onClick={() => openComposer({ kind: 'event', prefill: { due_day: data.day } })}>+ Event</button>
    </PanelTitle>
    {items.length ? <>
      <div className="tdt" title={formatMinutes(day.past_minutes) + ' gone of ' + formatMinutes(day.planned_minutes) + ' planned'}><b>{formatMinutes(day.planned_minutes)}</b></div>
      <div className="tdb" aria-hidden="true"><i style={{ '--w': Math.min(100, day.progress) + '%' }} /></div>
      <div className="tdl">
        {items.map((item, index) => <Fragment key={item.kind + item.id}>
          {index === day.now_index && nowLine}
          {index === day.now_index && freeRow}
          <div className={'tde' + (item.past ? ' past' : '') + (item.struck ? ' gone' : '')} style={{ '--c': `var(--${DOMAINS.has(item.domain) ? item.domain : 'work'})` }}>
            <time>{item.time}</time>
            <p><b title={item.title}>{item.title}</b><small>{metaOf(item)}</small></p>
          </div>
        </Fragment>)}
        {day.now_index === items.length && nowLine}
      </div>
    </> : <p className="empty">Nothing timed today. Add one with + Event.</p>}
  </section>;
}
