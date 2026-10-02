'use client';
// The Habits widget: each habit's icon is its tick
// button, then its name and its streak in the display font; under the list the
// four-week consistency map of project work with its two figures. The pencil
// toggles editing: click a habit's icon to pick another line icon, or its name
// to open the habit composer (rename, time of day, icon, delete and replace).
// A small return-arrow button logs a habit for yesterday.
// You keep exactly data.limit habits (five), so "+ Habit" shows only while
// there are fewer.
// Hovering a row lights its petal on the flower (components/dash/flower-hover.js).
import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PanelTitle from '../PanelTitle.jsx';
import { Icon } from '../icons.js';
import post from '../post.js';
import { openComposer } from '../composer/store.js';
import { useFlowerLink, setFlowerHover, tickedNow, settlePending, tickHabit } from '../flower-hover.js';
import { HABIT_ICON_GROUPS } from '@/lib/dash/flower-icons.js';

const dayLabel = day => new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function Consistency({ map, error }) {
  if (!map) return <div className="bl-con"><div className="bl-ch"><span>Consistency</span></div><p className="empty">{error}</p></div>;
  const cells = map.weeks.flat();
  return <div className="bl-con">
    <div className="bl-ch"><span>Consistency</span><span>last 4 weeks</span></div>
    <div className="bl-days" aria-hidden="true">{WEEKDAYS.map((day, index) => <span key={index}>{day}</span>)}</div>
    {/* four calendar weeks, a row a week: days after today are empty boxes */}
    <div className="bl-cmap" role="img" aria-label={`Project work over the last 4 weeks: ${map.share_pct}% of working days moved a project on, best run ${map.best_run} days`}>
      {cells.map(cell => <i key={cell.day} style={{ '--v': cell.v.toFixed(2) }}
        className={[cell.future && 'fut', !cell.future && cell.planned && 'pl', cell.done && 'on', cell.day === map.today && 'td'].filter(Boolean).join(' ') || undefined}
        title={cell.future ? undefined : `${dayLabel(cell.day)} · ${cell.planned ? `${cell.done} of ${cell.planned} project tasks` : 'nothing planned'}`} />)}
    </div>
    <div className="bl-ck">
      <p><b>{map.share_pct}%</b>of working days moved a project on</p>
      <p><b>{map.best_run}</b>day best run</p>
    </div>
  </div>;
}

export default function Habits({ data, flair, meta }) {
  const router = useRouter();
  const { hover, pending } = useFlowerLink();
  const [edit, setEdit] = useState(false);
  const [pick, setPick] = useState(null);
  const [error, setError] = useState('');
  const habits = data?.habits || [];
  const limit = data?.limit ?? 5;
  const add = () => openComposer({ kind: 'habit', prefill: { count: habits.length, limit } });
  const open = habit => openComposer({ kind: 'habit', record: habit, prefill: { count: habits.length, limit } });

  useEffect(() => { settlePending(habits); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const tick = habit => {
    setError('');
    tickHabit(habit).then(() => router.refresh(), problem => setError(problem.message));
  };
  // A habit missed at the time can be logged for yesterday; the refresh brings
  // back the new streak.
  const tickYesterday = async habit => {
    setError('');
    try {
      await post('/api/flower', { action: 'tick', habit_id: habit.id, day: 'yesterday' });
      router.refresh();
    } catch (problem) { setError(problem.message); }
  };
  const choose = async (habit, icon) => {
    setError('');
    try {
      await post('/api/flower', { action: 'icon', habit_id: habit.id, icon });
      setPick(null);
      router.refresh();
    } catch (problem) { setError(problem.message); }
  };

  return <section className="panel habits-w">
    <PanelTitle icon={meta.icon} title="Habits" jp={meta.jp} flair={flair}>
      {edit && <span className="bl-n" title={`You keep ${limit} habits`}>{habits.length} of {limit}</span>}
      {edit && habits.length < limit && <button type="button" className="lk" onClick={add}>+ Habit</button>}
      {habits.length > 0 && <button type="button" className="edit" aria-label="Edit habits" aria-pressed={edit}
        title={edit ? 'Done editing habits' : 'Edit habits'} onClick={() => { setEdit(!edit); setPick(null); }}>
        <Icon name="pen" size={14} stroke={2} />
      </button>}
    </PanelTitle>
    {habits.length === 0
      ? <p className="empty">No habits yet. <button type="button" className="lk" onClick={add}>Add a habit</button></p>
      : <div className="bl-rows" onMouseLeave={() => setFlowerHover(null)}>
        {habits.map(habit => {
          const on = tickedNow(habit, pending);
          const streak = Math.max(0, habit.streak + (on ? 1 : 0) - (habit.checked_today ? 1 : 0));
          // A habit counts from its first tick (lib/dash/flower.js); a tick
          // made now starts it, so only an unticked one reads as not tracked
          // (or as resting, when its last tick is long past).
          const idle = habit.tracked === false && !on;
          return <Fragment key={habit.id}>
            <div className={['bl-row', on && 'on', idle && 'idle', hover === habit.id && 'hv', edit && 'ed'].filter(Boolean).join(' ')}
              onMouseEnter={() => setFlowerHover(habit.id)}>
              <button type="button" className="bl-ico" aria-pressed={edit ? pick === habit.id : on}
                aria-label={edit ? `Change the icon for ${habit.name}` : `${on ? 'Untick' : 'Tick'} ${habit.name}`}
                title={edit ? 'Pick an icon' : on ? 'Done today, click to undo' : 'Tick for today'}
                onFocus={() => setFlowerHover(habit.id)} onBlur={() => setFlowerHover(null)}
                onClick={() => edit ? setPick(pick === habit.id ? null : habit.id) : tick(habit)}>
                <Icon name={habit.icon} size={17} stroke={1.7} />
              </button>
              {edit
                ? <button type="button" className="bl-name" title="Rename, change or replace this habit" onClick={() => open(habit)}>{habit.name}</button>
                : <p>{habit.name}</p>}
              {edit ? <span /> : <button type="button" className="bl-yd" aria-pressed={!!habit.checked_yesterday}
                aria-label={`${habit.checked_yesterday ? 'Untick' : 'Tick'} ${habit.name} for yesterday`}
                title={habit.checked_yesterday ? 'Done yesterday, click to undo' : 'Log it for yesterday'}
                onClick={() => tickYesterday(habit)}><Icon name="undo" size={13} stroke={2} /></button>}
              {idle
                ? <span className="bl-nt" title={habit.dormant ? 'No tick for a while; the next tick starts it again' : 'Its streak starts on the first tick'}>{habit.dormant ? 'Resting' : 'Not tracked yet'}</span>
                : <span className={'bl-st' + (streak >= 7 ? ' hot' : streak ? '' : ' z')} title={`${streak} day streak`}>{streak}</span>}
            </div>
            {edit && pick === habit.id && <div className="bl-pick" role="group" aria-label={`Icons for ${habit.name}`}>
              {HABIT_ICON_GROUPS.map(([label, icons]) => <div key={label} className="bl-pick-g">
                <span>{label}</span>
                <div>{icons.map(icon => <button key={icon} type="button" aria-label={`Use the ${icon} icon`} title={icon} aria-pressed={habit.icon === icon}
                  onClick={() => choose(habit, icon)}><Icon name={icon} size={18} stroke={1.7} /></button>)}</div>
              </div>)}
            </div>}
          </Fragment>;
        })}
      </div>}
    {edit && habits.length > 0 && <p className="bl-help">Click an icon to change it, or a name to rename or replace that habit.</p>}
    {error && <p className="bl-err" role="alert">{error}</p>}
    <Consistency map={data?.consistency} error={data?.consistency_error} />
  </section>;
}
