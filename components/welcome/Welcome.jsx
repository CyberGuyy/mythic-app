'use client';
// The first-run flow: five short steps, then the Dash. You, what you are
// working on, the habits that grow the flower, the first tasks and a
// calendar. Every step but the first can be skipped, and nothing is saved
// until Open Mythic posts it all to /api/onboarding.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, IconBadge } from '../dash/icons.js';
import post from '../dash/post.js';

const STEPS = [
  { id: 'you', title: 'Welcome', jp: 'ようこそ', icon: 'day' },
  { id: 'projects', title: 'Projects', jp: '計画', icon: 'flag' },
  { id: 'habits', title: 'Habits', jp: '習慣', icon: 'habits' },
  { id: 'tasks', title: 'First tasks', jp: 'タスク', icon: 'tasks' },
  { id: 'calendar', title: 'Calendar', jp: '暦', icon: 'calendar' },
];
const AREAS = [['work', 'Work'], ['life', 'Life'], ['home', 'Home']];
const TIMES = [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening']];
const PROJECT_IDEAS = [['Job', 'work'], ['Side project', 'work'], ['Health', 'life'], ['Learning', 'life'], ['Home', 'home'], ['Money', 'life']];

/** Every timezone this browser knows, with the guessed one first. */
function useZones(current) {
  return useMemo(() => {
    let zones = [];
    try { zones = Intl.supportedValuesOf('timeZone'); } catch { zones = []; }
    if (!zones.includes('UTC')) zones = ['UTC', ...zones];
    return current && !zones.includes(current) ? [current, ...zones] : zones;
  }, [current]);
}

function Step({ step, index, children }) {
  return <section className="panel wl-step" aria-labelledby={'wl-h-' + step.id}>
    <h2 id={'wl-h-' + step.id}><IconBadge name={step.icon} />{step.title}<em className="jp" lang="ja">{step.jp}</em><span className="wl-count">{index + 1} of {STEPS.length}</span></h2>
    {children}
  </section>;
}

export default function Welcome({ profile, ideas, limits }) {
  const router = useRouter();
  const [at, setAt] = useState(0);
  const [name, setName] = useState(profile.name || '');
  const [timezone, setTimezone] = useState(profile.timezone || 'UTC');
  const [projects, setProjects] = useState([]);
  const [projectLine, setProjectLine] = useState('');
  const [projectArea, setProjectArea] = useState('work');
  const [habits, setHabits] = useState([]);
  const [habitLine, setHabitLine] = useState('');
  const [tasks, setTasks] = useState([]);
  const [taskLine, setTaskLine] = useState('');
  const [taskProject, setTaskProject] = useState(null);
  const [calendar, setCalendar] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const zones = useZones(timezone);
  const heading = useRef(null);

  // The browser knows where it is: start from its timezone on a first run.
  // (After the first paint, so the server's UTC and the browser agree while hydrating.)
  useEffect(() => {
    if (profile.timezone) return undefined;
    const timer = setTimeout(() => {
      try {
        const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (guess) setTimezone(guess);
      } catch { /* UTC stays */ }
    }, 0);
    return () => clearTimeout(timer);
  }, [profile.timezone]);
  useEffect(() => { heading.current?.querySelector('h2')?.focus?.(); }, [at]);

  const step = STEPS[at];
  const last = at === STEPS.length - 1;
  const habitFull = habits.length >= limits.habits;

  function addProject(projectName = projectLine, domain = projectArea) {
    const clean = projectName.trim();
    if (!clean || projects.length >= limits.projects || projects.some(project => project.name.toLowerCase() === clean.toLowerCase())) return;
    setProjects(list => [...list, { name: clean, domain }]);
    setProjectLine('');
  }
  function removeProject(index) {
    setProjects(list => list.filter((_, i) => i !== index));
    setTasks(list => list.map(task => task.project === index ? { ...task, project: null } : task.project > index ? { ...task, project: task.project - 1 } : task));
    setTaskProject(null);
  }
  function toggleIdea(idea) {
    setHabits(list => list.some(habit => habit.name === idea.name) ? list.filter(habit => habit.name !== idea.name) : list.length >= limits.habits ? list : [...list, { ...idea }]);
  }
  function addHabit() {
    const clean = habitLine.trim();
    if (!clean || habitFull || habits.some(habit => habit.name.toLowerCase() === clean.toLowerCase())) return;
    setHabits(list => [...list, { name: clean, time_of_day: 'morning', icon: null }]);
    setHabitLine('');
  }
  function addTask() {
    const clean = taskLine.trim();
    if (!clean || tasks.length >= limits.tasks) return;
    setTasks(list => [...list, { title: clean, project: taskProject }]);
    setTaskLine('');
  }

  async function finish() {
    setBusy(true); setError('');
    try {
      await post('/api/onboarding', { name, timezone, projects, habits, tasks, calendar_url: calendar });
      router.push('/dash');
      router.refresh();
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }
  const next = () => { setError(''); if (last) finish(); else setAt(value => value + 1); };
  const back = () => { setError(''); setAt(value => Math.max(0, value - 1)); };
  const enter = action => event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); action(); } };

  return <div className="dash-root wl-root" data-theme="yoru">
    <div className="dash-wrap wl-wrap">
      <nav className="dash-nav" aria-label="Mythic">
        <span className="dash-mark"><i aria-hidden="true" />Mythic<em lang="ja">夜</em></span>
        <ol className="wl-dots" aria-label="Steps">
          {STEPS.map((item, index) => <li key={item.id} aria-current={index === at ? 'step' : undefined} data-done={index < at ? '' : undefined}><span className="sr">{item.title}</span></li>)}
        </ol>
      </nav>

      <div ref={heading} className="wl-body">
        {step.id === 'you' && <Step step={step} index={at}>
          <p className="wl-lead">Mythic is one page for your day: your tasks, the habits that grow a flower, your notes, your calendar and the year ahead. It runs on your machine and keeps everything in one file you own.</p>
          <label className="wl-field"><span>What should Mythic call you?</span>
            <input value={name} onChange={event => setName(event.target.value)} placeholder="Your first name" maxLength={40} autoComplete="given-name" autoFocus onKeyDown={enter(next)} />
          </label>
          <label className="wl-field"><span>Your timezone</span>
            <select value={timezone} onChange={event => setTimezone(event.target.value)}>
              {zones.map(zone => <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>)}
            </select>
            <small>Your day starts at midnight here. Today, overdue and streaks all count from it.</small>
          </label>
        </Step>}

        {step.id === 'projects' && <Step step={step} index={at}>
          <p className="wl-lead">What are you working on? Projects group your tasks, and each one gets a button over the task list with this week&apos;s progress. A deadline puts a flag on the year line.</p>
          <div className="wl-chips" role="group" aria-label="Ideas">
            {PROJECT_IDEAS.map(([idea, domain]) => <button key={idea} type="button" className="wl-chip" disabled={projects.length >= limits.projects}
              aria-pressed={projects.some(project => project.name === idea)} onClick={() => projects.some(project => project.name === idea) ? removeProject(projects.findIndex(project => project.name === idea)) : addProject(idea, domain)}>{idea}</button>)}
          </div>
          <div className="wl-add">
            <input value={projectLine} onChange={event => setProjectLine(event.target.value)} onKeyDown={enter(() => addProject())} placeholder="Name a project" maxLength={120} aria-label="Project name" disabled={projects.length >= limits.projects} />
            <span className="wl-seg" role="group" aria-label="Area">{AREAS.map(([id, label]) => <button key={id} type="button" aria-pressed={projectArea === id} onClick={() => setProjectArea(id)}>{label}</button>)}</span>
            <button type="button" className="btn sm" onClick={() => addProject()} disabled={!projectLine.trim() || projects.length >= limits.projects}>Add</button>
          </div>
          {projects.length > 0 && <ul className="wl-list">{projects.map((project, index) => <li key={project.name}>
            <i style={{ '--c': `var(--${project.domain})` }} aria-hidden="true" />
            <b>{project.name}</b>
            <span className="wl-seg sm" role="group" aria-label={'Area of ' + project.name}>{AREAS.map(([id, label]) => <button key={id} type="button" aria-pressed={project.domain === id} onClick={() => setProjects(list => list.map((item, i) => i === index ? { ...item, domain: id } : item))}>{label}</button>)}</span>
            <input type="date" className="wl-date" value={project.deadline || ''} aria-label={'Deadline for ' + project.name} title="Deadline (optional)" onChange={event => setProjects(list => list.map((item, i) => i === index ? { ...item, deadline: event.target.value || null } : item))} />
            <button type="button" className="wl-x" aria-label={'Remove ' + project.name} onClick={() => removeProject(index)}><Icon name="x" size={14} /></button>
          </li>)}</ul>}
          <p className="wl-note">{projects.length} of {limits.projects}. You can add, rename and archive projects any time from the task list.</p>
        </Step>}

        {step.id === 'habits' && <Step step={step} index={at}>
          <p className="wl-lead">Pick up to {limits.habits} habits. Each one is a petal on your flower: tick it on a day and the petal grows; miss days and it tears. Good days in a row earn new colours.</p>
          <div className="wl-chips" role="group" aria-label="Habit ideas">
            {ideas.map(idea => <button key={idea.name} type="button" className="wl-chip" aria-pressed={habits.some(habit => habit.name === idea.name)}
              disabled={habitFull && !habits.some(habit => habit.name === idea.name)} onClick={() => toggleIdea(idea)}>
              <Icon name={idea.icon} size={14} />{idea.name}</button>)}
          </div>
          <div className="wl-add">
            <input value={habitLine} onChange={event => setHabitLine(event.target.value)} onKeyDown={enter(addHabit)} placeholder="Or write your own" maxLength={120} aria-label="Habit name" disabled={habitFull} />
            <button type="button" className="btn sm" onClick={addHabit} disabled={!habitLine.trim() || habitFull}>Add</button>
          </div>
          {habits.length > 0 && <ul className="wl-list">{habits.map((habit, index) => <li key={habit.name}>
            <span className="wl-ico" aria-hidden="true">{habit.icon ? <Icon name={habit.icon} size={15} /> : <Icon name="leaf" size={15} />}</span>
            <b>{habit.name}</b>
            <span className="wl-seg sm" role="group" aria-label={'When for ' + habit.name}>{TIMES.map(([id, label]) => <button key={id} type="button" aria-pressed={habit.time_of_day === id} onClick={() => setHabits(list => list.map((item, i) => i === index ? { ...item, time_of_day: id } : item))}>{label}</button>)}</span>
            <button type="button" className="wl-x" aria-label={'Remove ' + habit.name} onClick={() => setHabits(list => list.filter((_, i) => i !== index))}><Icon name="x" size={14} /></button>
          </li>)}</ul>}
          <p className="wl-note">{habits.length} of {limits.habits} petals. {habits.length < limits.habits ? 'The flower blooms fully with five; you can fill the rest later.' : 'A full flower.'}</p>
        </Step>}

        {step.id === 'tasks' && <Step step={step} index={at}>
          <p className="wl-lead">Write down what is on your mind, a few things to start with. On the Dash you can give each a day, a time, an estimate and a repeat.</p>
          <div className="wl-add">
            <input value={taskLine} onChange={event => setTaskLine(event.target.value)} onKeyDown={enter(addTask)} placeholder="What needs doing" maxLength={500} aria-label="Task" disabled={tasks.length >= limits.tasks} autoFocus />
            {projects.length > 0 && <select className="wl-pick" value={taskProject ?? ''} onChange={event => setTaskProject(event.target.value === '' ? null : Number(event.target.value))} aria-label="Project">
              <option value="">No project</option>
              {projects.map((project, index) => <option key={project.name} value={index}>{project.name}</option>)}
            </select>}
            <button type="button" className="btn sm" onClick={addTask} disabled={!taskLine.trim() || tasks.length >= limits.tasks}>Add</button>
          </div>
          {tasks.length > 0 && <ul className="wl-list">{tasks.map((task, index) => <li key={index}>
            <span className="wl-tick" aria-hidden="true" />
            <b>{task.title}</b>
            {task.project !== null && projects[task.project] && <span className="wl-tag">{projects[task.project].name}</span>}
            <button type="button" className="wl-x" aria-label={'Remove ' + task.title} onClick={() => setTasks(list => list.filter((_, i) => i !== index))}><Icon name="x" size={14} /></button>
          </li>)}</ul>}
          <p className="wl-note">Tip: on the Dash, ⌘K captures a task, a note or a habit from anywhere on the page.</p>
        </Step>}

        {step.id === 'calendar' && <Step step={step} index={at}>
          <p className="wl-lead">Show your calendar beside your tasks. Paste the private iCal address of a Google, iCloud, Outlook or Fastmail calendar. Mythic only reads it.</p>
          <label className="wl-field"><span>iCal address</span>
            <input value={calendar} onChange={event => setCalendar(event.target.value)} placeholder="https://… or webcal://…" inputMode="url" autoComplete="off" spellCheck={false} />
          </label>
          <details className="wl-help">
            <summary>Where do I find it?</summary>
            <ul>
              <li><b>Google Calendar:</b> Settings, pick the calendar, then Integrate calendar, and copy the Secret address in iCal format.</li>
              <li><b>iCloud:</b> in the Calendar app, share the calendar as a Public Calendar and copy its webcal link.</li>
              <li><b>Outlook:</b> Settings, Calendar, Shared calendars, Publish a calendar, then copy the ICS link.</li>
            </ul>
          </details>
          <p className="wl-note">Skip it if you like. Connections, in the top bar, adds calendars later, along with Telegram capture, the Apple Health sleep import and an API for your own scripts.</p>
        </Step>}
      </div>

      {error && <p className="dash-alert wl-error" role="alert">{error}</p>}
      <div className="wl-foot">
        {at > 0 ? <button type="button" className="lk" onClick={back} disabled={busy}>Back</button> : <span />}
        <span className="wl-acts">
          {at > 0 && !last && <button type="button" className="lk" onClick={next}>Skip</button>}
          <button type="button" className="btn" onClick={next} disabled={busy}>{last ? (busy ? 'Setting up…' : 'Open Mythic') : 'Continue'}</button>
        </span>
      </div>
    </div>
  </div>;
}
