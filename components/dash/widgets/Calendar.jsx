'use client';
// Calendar: the big month grid across the bottom of the right zone (always
// last, full width; the design mockups calendarBig). Task due
// days, project deadlines and meetings as chips, at most three a day. The
// loader sends last month, this month and next month, so prev and next page
// without a reload. Clicking a day lists its items under the grid. "+ Event"
// opens the event composer on the picked day (else today): an event here is a
// task with a day and a time. Once it saves, the grid shows that day picked.
import { useState } from 'react';
import PanelTitle from '../PanelTitle.jsx';
import { Icon } from '../icons.js';
import { openComposer } from '../composer/store.js';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const JP_MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const DOMAINS = ['work', 'life', 'home'];
const MAX_CHIPS = 3;
const EDGE = 'Only last month to next month are loaded';

const colourOf = item => item.kind === 'deadline' ? 'var(--hot)' : `var(--${DOMAINS.includes(item.domain) ? item.domain : 'work'})`;
const chipText = item => item.time ? item.title + ' ' + item.time.replace(/^0(\d)/, '$1') : item.title;
const kindLine = item => item.kind === 'deadline' ? 'Deadline' : item.kind === 'event' ? 'Meeting' : item.late ? 'Overdue' : 'Due';
function longDay(day) {
  const date = new Date(day + 'T12:00:00Z');
  return DAY_NAMES[date.getUTCDay()] + ' ' + date.getUTCDate() + ' ' + LONG_MONTHS[date.getUTCMonth()];
}

export default function Calendar({ data, flair, meta }) {
  const months = data?.months || [];
  const home = Math.max(0, months.findIndex(grid => grid.month === data?.month));
  const [index, setIndex] = useState(home);
  const [selected, setSelected] = useState(null);

  const grid = months[index] || months[home];
  if (!grid) return <section className="panel calb"><PanelTitle icon={meta.icon} title="Calendar" jp={meta.jp} flair={flair} /><p className="empty">The calendar has no months to show.</p></section>;

  const days = data.days || {};
  const thisYear = Number(String(data.today).slice(0, 4));
  const title = grid.name + (grid.year !== thisYear ? ' ' + grid.year : '');
  const monthNumber = Number(grid.month.slice(5)) - 1;

  function addEvent() {
    const day = selected || data.today;
    openComposer({
      kind: 'event', prefill: { due_day: day },
      onSaved: ({ body }) => { const saved = body?.due_day || day; if (goTo(saved)) setSelected(saved); },
    });
  }

  /** Shows the month holding `day`; false when it is not one of the three loaded. */
  function goTo(day) {
    const at = months.findIndex(item => item.month === day.slice(0, 7));
    if (at >= 0) setIndex(at);
    return at >= 0;
  }

  // Disabled-looking but still focusable, so the tooltip saying why shows on
  // hover and to a screen reader (a disabled button gets neither everywhere).
  const step = delta => {
    const next = index + delta;
    if (next >= 0 && next < months.length) setIndex(next);
  };

  const picked = selected ? days[selected] || [] : null;

  return <section className="panel calb">
    <PanelTitle icon={meta.icon} title={title} jp={JP_MONTHS[monthNumber]} flair={flair}>
      <button type="button" className="lk cal-nav" aria-label="Previous month" aria-disabled={index === 0} title={index === 0 ? EDGE : 'Previous month'} onClick={() => step(-1)}><Icon name="left" size={15} stroke={2} /></button>
      <button type="button" className="lk" onClick={() => { setIndex(home); setSelected(null); }}>Today</button>
      <button type="button" className="lk cal-nav" aria-label="Next month" aria-disabled={index === months.length - 1} title={index === months.length - 1 ? EDGE : 'Next month'} onClick={() => step(1)}><Icon name="right" size={15} stroke={2} /></button>
      <button type="button" className="lk" onClick={addEvent}>+ Event</button>
    </PanelTitle>

    <div className="cbg">
      {WEEKDAYS.map(name => <em key={name}>{name}</em>)}
      {grid.cells.map(cell => {
        const items = days[cell.day] || [];
        const shown = items.slice(0, MAX_CHIPS), more = items.length - shown.length;
        const month = Number(cell.day.slice(5, 7)) - 1;
        const cls = ['cbd', !cell.in_month && 'out', cell.past && 'past', cell.today && 'today', selected === cell.day && 'on'].filter(Boolean).join(' ');
        return <button type="button" key={cell.day} className={cls} aria-pressed={selected === cell.day} aria-label={longDay(cell.day) + (items.length ? ', ' + items.length + (items.length === 1 ? ' item' : ' items') : '')}
          onClick={() => setSelected(selected === cell.day ? null : cell.day)}>
          <b>{cell.date}{cell.date === 1 && !cell.in_month ? ' ' + SHORT_MONTHS[month] : ''}</b>
          {shown.map(item => <span key={item.kind + item.id} className={'ch' + (item.kind === 'deadline' ? ' dl' : '') + (item.late ? ' late' : '')} style={{ '--c': colourOf(item) }}
            title={[chipText(item), item.project_name && item.project_name !== item.title ? item.project_name : null, kindLine(item)].filter(Boolean).join(' · ')}>{chipText(item)}</span>)}
          {more > 0 && <span className="cmore">+{more}</span>}
        </button>;
      })}
    </div>

    <div aria-live="polite">{picked && <div className="cal-day">
      <h3>{longDay(selected)}</h3>
      {picked.length ? <ul>
        {picked.map(item => <li key={item.kind + item.id} style={{ '--c': colourOf(item) }}>
          <time>{item.time || 'All day'}</time>
          <p>{item.title}</p>
          <small className={item.late ? 'late' : ''}>{[item.kind === 'deadline' ? null : item.project_name, kindLine(item)].filter(Boolean).join(' · ')}</small>
        </li>)}
      </ul> : <p className="empty">Nothing planned.</p>}
    </div>}</div>
  </section>;
}
