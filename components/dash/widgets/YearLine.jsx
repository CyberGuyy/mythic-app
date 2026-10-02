'use client';
// The Dash year line: the
// year and how much of it is gone, a track with the gone segment, month
// ticks, the now marker, and a diamond flag for each project deadline plus
// Year end. Positions come from lib/dash/yearline.js as percentages.
//
// The labels are laid out for the width the track is drawn at: the
// server lays them out for a 1440 px page, and once the track is measured
// here, placeFlags (lib/dash/yearline-layout.js) lays them out again at its
// real width, and again whenever that changes. A label that would collide
// drops its date first (short), then takes the row under the months, then
// goes quiet (its diamond and tooltip stay). The fork's place is held first,
// so no label is drawn across it.
import { useEffect, useRef, useState } from 'react';
import { placeFlags } from '../../../lib/dash/yearline-layout.js';

const DOMAIN_COLOUR = { work: 'var(--work)', life: 'var(--life)', home: 'var(--home)' };
const pct = value => value + '%';

/** The track's drawn width in px, once measured; null before (the server's layout stands). */
function useTrackWidth(ref) {
  const [width, setWidth] = useState(null);
  useEffect(() => {
    const track = ref.current;
    if (!track) return undefined;
    const read = () => { const w = Math.round(track.getBoundingClientRect().width); if (w > 0) setWidth(w); };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(read);
    watch.observe(track);
    return () => watch.disconnect();
  }, [ref]);
  return width;
}

export default function YearLine({ data }) {
  const track = useRef(null);
  const width = useTrackWidth(track);
  const fork = data.forks?.length > 0;
  const flags = width ? placeFlags(data.flags, { width, fork_at: fork ? data.now_at : null }) : data.flags;
  const left = data.days_left === 1 ? '1 day left' : `${data.days_left} days left`;
  const rows = Math.max(0, ...flags.filter(flag => !flag.quiet).map(flag => flag.lane || 0));
  return <section className={'dash-yearline yl' + (rows === 2 ? ' three' : rows === 1 ? ' two' : '')} aria-label={`${data.year}, ${data.pct_gone}% gone, ${left}`}>
    <div className="yl-h"><b>{data.year}</b><span>{data.pct_gone}% gone · {left}</span></div>
    <div className="yl-t" ref={track} style={{ '--w': pct(data.now_at) }}>
      <i className="gone" />
      {data.months.map(month => <div key={month.label} className="mo" style={{ left: pct(month.at) }}><span>{month.label}</span></div>)}
      {fork && <span className="fork" role="img" aria-label={data.fork_title} title={data.fork_title}>
        <svg viewBox="0 0 24 16" aria-hidden="true"><path d="M1 15 C5 15 6 3 12 3 L23 3" /></svg>
      </span>}
      {flags.map(flag => {
        const title = flag.id === 'year-end' ? `Year end, ${data.days_left} days left` : `${flag.name}, due ${flag.on}`;
        // A quiet flag had no room for its label: the diamond alone, named by its tooltip.
        // A short one had room for its name only: the date is in its tooltip.
        return <div key={flag.id} className={`flag ${flag.side}${flag.lane ? ' low' : ''}${flag.lane === 2 ? ' low2' : ''}${flag.quiet ? ' quiet' : ''}`}
          style={{ left: pct(flag.at), '--c': DOMAIN_COLOUR[flag.domain] || 'var(--home)' }}
          title={title} aria-label={flag.quiet ? title : undefined} role={flag.quiet ? 'img' : undefined}>
          {!flag.quiet && flag.name}{!flag.quiet && !flag.short && flag.on && <small>{flag.on}</small>}
        </div>;
      })}
      <div className="now" />
    </div>
  </section>;
}
