'use client';
// The Dash header band: the date, one subline (week, local time, what is left
// today and what is urgent) and the Today card, over the theme's sky canvas.
// Yoru (flair.jp) adds the vertical weekday in Japanese, stacks the weekday
// over the date and prints the subline as an orange date stamp. The look is
// CSS in app/dash/widgets/header.css.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { localTime } from '@/lib/simple/format.js';
import { localToday } from '@/lib/day.js';
import { paintSky } from './sky.js';

/** The local wall clock, ticking on the minute without a server round-trip.
 *  The clock is information, not motion, so it ticks under reduced motion too.
 *  When the local day turns (midnight, or waking the Mac the next morning)
 *  the page refreshes, so the date, the score and every loader move with it. */
function useLocalClock(initial, day) {
  const router = useRouter();
  const [time, setTime] = useState(initial);
  useEffect(() => {
    let interval = null;
    const tick = () => {
      const now = new Date();
      setTime(localTime(now));
      if (day && localToday(now) !== day) router.refresh();
    };
    tick();
    const toNextMinute = 60000 - (Date.now() % 60000) + 50;
    const timeout = setTimeout(() => { tick(); interval = setInterval(tick, 60000); }, toNextMinute);
    return () => { clearTimeout(timeout); if (interval) clearInterval(interval); };
  }, [day, router]);
  return time;
}

function Sky({ kind }) {
  const canvas = useRef(null);
  useEffect(() => {
    const node = canvas.current;
    if (!node || !kind) return undefined;
    let width = 0, timer = 0;
    const draw = () => {
      timer = 0;
      if (node.clientWidth === width) return;
      width = node.clientWidth;
      paintSky(node, kind);
    };
    draw();
    // Redraw once the width settles; the height is fixed by the stylesheet.
    // Dragging the window edge would otherwise repaint the sky every frame.
    const observer = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(draw, 150); });
    observer.observe(node);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [kind]);
  return <canvas ref={canvas} className="dash-sky" data-sky={kind} aria-hidden="true" />;
}

export default function Header({ data, flair }) {
  const time = useLocalClock(data.time_label, data.day);
  const jp = !!flair?.jp;
  const rest = data.rest;
  const tally = data.total ? `${data.done} of ${data.total} done` : 'nothing due';

  return <section className="dash-header" aria-label="Today">
    <Sky kind={flair?.sky} />
    <div className="when">
      {jp && <div className="v" lang="ja" aria-hidden="true">{data.weekday_jp}</div>}
      <div>
        <h1><span className="wd">{data.weekday}</span> {data.date_label}</h1>
        <p className="stampt">{time} · week {data.week} · {rest}</p>
      </div>
    </div>
    <div className="tcard" title={data.total ? `${data.left} left, ${data.urgent} urgent` : undefined}>
      <div className="lab">Today{jp && <em lang="ja">今日</em>}</div>
      {/* The figure counts up in CSS (header.css): the server already prints the
          real value, the global reduced-motion rule skips the count, and no
          JavaScript runs per frame. The text stays in the DOM for copy and
          screen readers; the counter only paints over it. */}
      <div className="n"><span className="pct" style={{ '--pct': data.pct }}><span className="pct-t">{data.pct}</span></span>%<small>{tally}</small></div>
      <div className="bar" role="progressbar" aria-label="Today's tasks done" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.pct}><i style={{ '--w': data.pct + '%' }} /></div>
    </div>
  </section>;
}
